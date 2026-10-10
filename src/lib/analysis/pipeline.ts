import path from "node:path";
import { scrapeProfileDetails, scrapeProfilePosts } from "./apify";
import { cachedJson, paths } from "./cache";
import { VIDEO_CONCURRENCY } from "./config";
import { detectCreator, rankCreators, type CreatorMatch } from "./influencers";
import {
  isPresent,
  normalizeVideo,
  type ApifyPostItem,
  type InstagramVideo,
} from "./instagram";
import {
  detectScenes,
  downloadVideo,
  extractAudio,
  extractFrames,
  probeVideo,
  selectFrameTimestamps,
  type Frame,
} from "./media";
import {
  analyzeComments,
  analyzeVideo,
  concludeInsights,
  PROMPT_VERSIONS,
  transcribe,
  type ConclusionVideo,
} from "./openai";
import {
  BrandAnalysisSchema,
  isAnalyzedTier,
  TIERS,
  type AnalyzedVideo,
  type BrandAnalysis,
  type RunState,
  type StageName,
  type Tier,
} from "./schema";
import { isTooRecent, scoreVideos, type ScoredVideo } from "./scoring";

type VideoResult = Pick<
  AnalyzedVideo,
  "frames" | "transcript" | "videoAnalysis" | "commentAnalysis"
>;
// Warnings are partial failures (transcript, comments) that still leave a usable video analysis.
type VideoOutcome = VideoResult & { warnings: string[] };

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const round = (value: number | undefined) =>
  value === undefined ? null : Math.round(value * 1000) / 1000;

export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) await worker(items[next++]);
    },
  );
  await Promise.all(runners);
}

export function throwIfProfileError(items: ApifyPostItem[], username: string) {
  if (items.length === 0)
    throw new Error(
      `No posts returned for @${username}. Is the profile public?`,
    );
  if (items.every((item) => item.error)) {
    throw new Error(
      `Instagram profile @${username}: ${items[0].errorDescription ?? items[0].error}`,
    );
  }
}

async function transcriptFor(
  video: InstagramVideo,
  videoPath: string,
  hasAudio: boolean,
) {
  const cached = await cachedJson(
    paths.ai(video.shortCode, "transcript", PROMPT_VERSIONS.transcript),
    async () => {
      if (!hasAudio) return { text: null };
      const audioPath = path.join(paths.media(video.shortCode), "audio.mp3");
      await extractAudio(videoPath, audioPath);
      return { text: (await transcribe(audioPath)) || null };
    },
  );
  return cached.text;
}

export async function analyzeOneVideo({
  video,
  creator,
}: ScoredVideo): Promise<VideoOutcome> {
  const mediaDir = paths.media(video.shortCode);
  const videoPath = path.join(mediaDir, "video.mp4");
  await downloadVideo(video.videoUrl, videoPath);
  const probe = await probeVideo(videoPath);
  const durationSeconds = video.durationSeconds ?? probe.durationSeconds;
  const frames = await cachedJson<Frame[]>(
    path.join(mediaDir, "frames.json"),
    async () =>
      extractFrames(
        videoPath,
        path.join(mediaDir, "frames"),
        selectFrameTimestamps(await detectScenes(videoPath), durationSeconds),
      ),
  );
  const warnings: string[] = [];
  const warn = (message: string) => {
    console.warn(`${video.shortCode}: ${message}`);
    warnings.push(message);
  };
  // A transcription failure should not cost us the visual analysis.
  const transcript = await transcriptFor(
    video,
    videoPath,
    probe.hasAudio,
  ).catch((error) => {
    warn(`Transcription failed: ${errorMessage(error)}`);
    return undefined;
  });
  const transcriptUnavailable = transcript === undefined;
  const runVideoAnalysis = () =>
    analyzeVideo({
      creator,
      caption: video.caption,
      durationSeconds,
      transcript: transcript ?? null,
      transcriptUnavailable,
      frames: frames.map((frame) => ({
        timestampSeconds: frame.timestampSeconds,
        path: path.join(mediaDir, "frames", frame.file),
      })),
    });
  // An analysis made without the transcript is incomplete; do not cache it, so the next run redoes it.
  const videoAnalysis = transcriptUnavailable
    ? await runVideoAnalysis()
    : await cachedJson(
        paths.ai(video.shortCode, "video", PROMPT_VERSIONS.video),
        runVideoAnalysis,
      );
  // The video analysis is already paid for; a comment failure should not discard it.
  const commentAnalysis =
    video.latestComments.length === 0
      ? null
      : await cachedJson(
          paths.ai(video.shortCode, "comments", PROMPT_VERSIONS.comments),
          () =>
            analyzeComments({
              caption: video.caption,
              comments: video.latestComments,
            }),
        ).catch((error) => {
          warn(`Comment analysis failed: ${errorMessage(error)}`);
          return null;
        });
  return {
    frames,
    transcript: transcript ?? null,
    videoAnalysis,
    commentAnalysis,
    warnings,
  };
}

// Uses the same id as analysis.videos[].id so conclusions join back to their videos.
export function buildConclusionInput(
  scored: ScoredVideo[],
  results: Map<string, VideoResult>,
): ConclusionVideo[] {
  return scored.flatMap((item) => {
    const result = results.get(item.video.shortCode);
    if (!result?.videoAnalysis) return [];
    return [
      {
        id: item.video.id,
        creator: item.creator,
        tier: item.tier,
        brandScore: round(item.brand?.score),
        influencerScore: round(item.influencer?.score),
        metrics: {
          views: item.video.views,
          likes: item.video.likes,
          comments: item.video.comments,
        },
        videoAnalysis: result.videoAnalysis,
        commentAnalysis: result.commentAnalysis,
      },
    ];
  });
}

// Too-recent videos are never scored, so their creators should not take paid scrape slots.
export function creatorsToScrape(
  influencerVideos: { video: InstagramVideo; match: CreatorMatch }[],
  max: number,
  now: Date,
) {
  return rankCreators(
    influencerVideos
      .filter(({ video }) => !isTooRecent(video, now))
      .map(({ video, match }) => ({
        creator: match.creator,
        postedAt: video.postedAt,
      })),
    max,
  );
}

function toAnalyzedVideo(
  item: ScoredVideo,
  result: VideoResult | undefined,
  state: RunState,
): AnalyzedVideo {
  const progress = state.videos.find(
    (video) => video.shortCode === item.video.shortCode,
  );
  const status =
    progress?.status === "analyzed"
      ? "analyzed"
      : progress?.status === "failed"
        ? "failed"
        : "skipped";
  return {
    id: item.video.id,
    shortCode: item.video.shortCode,
    url: item.video.url,
    creator: item.creator,
    source: item.source,
    postedAt: item.video.postedAt,
    durationSeconds: item.video.durationSeconds,
    caption: item.video.caption,
    metrics: {
      views: item.video.views,
      likes: item.video.likes,
      comments: item.video.comments,
    },
    brandScore: round(item.brand?.score),
    influencerScore: round(item.influencer?.score),
    ratios: {
      brand: item.brand?.ratios ?? null,
      influencer: item.influencer?.ratios ?? null,
    },
    tier: item.tier,
    rank: item.rank,
    status,
    error: progress?.error ?? null,
    frames: result?.frames ?? [],
    transcript: result?.transcript ?? null,
    videoAnalysis: result?.videoAnalysis ?? null,
    commentAnalysis: result?.commentAnalysis ?? null,
  };
}

const tierOrder = (tier: Tier) => TIERS.indexOf(tier);

export async function runPipeline(
  state: RunState,
  persist: () => Promise<void>,
): Promise<BrandAnalysis> {
  const brand = state.brandUsername;

  async function stage<T>(
    name: StageName,
    work: () => Promise<{ result: T; detail: string }>,
  ): Promise<T> {
    state.stages[name] = { status: "running", detail: null };
    await persist();
    try {
      const { result, detail } = await work();
      state.stages[name] = { status: "done", detail };
      await persist();
      return result;
    } catch (error) {
      state.stages[name] = { status: "failed", detail: errorMessage(error) };
      throw error;
    }
  }

  const { brandVideos, followers, scrapedAt } = await stage(
    "scrapeBrand",
    async () => {
      const [details, posts] = await Promise.all([
        scrapeProfileDetails(brand),
        scrapeProfilePosts([brand], state.settings.brandPostLimit),
      ]);
      state.apifySpendUsd += details.costUsd + posts.costUsd;
      throwIfProfileError(posts.items, brand);
      const videos = posts.items.map(normalizeVideo).filter(isPresent);
      return {
        result: {
          brandVideos: videos,
          followers: details.items[0]?.followersCount ?? null,
          // Video age is measured against when the metrics were scraped, which may be an older cached scrape.
          scrapedAt: new Date(posts.scrapedAt),
        },
        detail: `${videos.length} videos in ${posts.items.length} posts`,
      };
    },
  );

  const influencerVideos = await stage("detectInfluencers", async () => {
    const matches = brandVideos.flatMap((video) => {
      const match: CreatorMatch | null = detectCreator(video, brand);
      return match ? [{ video, match }] : [];
    });
    const creators = new Set(matches.map(({ match }) => match.creator));
    return {
      result: matches,
      detail: `${matches.length} influencer videos from ${creators.size} creators`,
    };
  });

  const creatorVideos = await stage("scrapeCreators", async () => {
    const byCreator = new Map<string, InstagramVideo[]>();
    const creators = creatorsToScrape(
      influencerVideos,
      state.settings.maxCreators,
      scrapedAt,
    );
    if (creators.length === 0)
      return { result: byCreator, detail: "No creators to scrape" };
    const posts = await scrapeProfilePosts(
      creators,
      state.settings.creatorPostLimit,
    );
    state.apifySpendUsd += posts.costUsd;
    for (const video of posts.items.map(normalizeVideo).filter(isPresent)) {
      byCreator.set(video.sourceProfile, [
        ...(byCreator.get(video.sourceProfile) ?? []),
        video,
      ]);
    }
    return {
      result: byCreator,
      detail: `${posts.items.length} posts from ${creators.length} creators`,
    };
  });

  const scored = await stage("score", async () => {
    const result = scoreVideos({
      influencerVideos,
      brandVideos,
      creatorVideos,
      now: scrapedAt,
    });
    state.videos = result.map((item) => ({
      shortCode: item.video.shortCode,
      creator: item.creator,
      tier: item.tier,
      status: isAnalyzedTier(item.tier) ? "pending" : "skipped",
      error: null,
    }));
    const count = (tier: Tier) =>
      result.filter((item) => item.tier === tier).length;
    return {
      result,
      detail: `${count("amplify")} amplify, ${count("observe")} observe, ${count("stop")} stop`,
    };
  });

  const results = new Map<string, VideoResult>();
  await stage("analyzeVideos", async () => {
    const targets = scored.filter((item) => isAnalyzedTier(item.tier));
    await mapWithConcurrency(targets, VIDEO_CONCURRENCY, async (item) => {
      const progress = state.videos.find(
        (video) => video.shortCode === item.video.shortCode,
      );
      if (!progress) return;
      progress.status = "running";
      await persist();
      try {
        const outcome = await analyzeOneVideo(item);
        results.set(item.video.shortCode, outcome);
        progress.status = "analyzed";
        progress.error = outcome.warnings.join(" ") || null;
      } catch (error) {
        progress.status = "failed";
        progress.error = errorMessage(error);
      }
      await persist();
    });
    const failed = state.videos.filter(
      (video) => video.status === "failed",
    ).length;
    return {
      result: undefined,
      detail: `${results.size} analyzed, ${failed} failed`,
    };
  });

  const conclusions = await stage("conclude", async () => {
    const input = buildConclusionInput(scored, results);
    if (input.length === 0)
      return { result: null, detail: "No analyzed videos" };
    const result = await cachedJson(
      path.join(
        paths.run(state.id),
        `conclusions.v${PROMPT_VERSIONS.conclusions}.json`,
      ),
      () => concludeInsights(brand, input),
    );
    return {
      result,
      detail: `${result.amplifyPatterns.length} amplify patterns, ${result.replicationBriefs.length} briefs`,
    };
  });

  const ordered = [...scored].sort(
    (a, b) =>
      tierOrder(a.tier) - tierOrder(b.tier) ||
      (a.rank ?? Infinity) - (b.rank ?? Infinity),
  );
  return BrandAnalysisSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    brand: { username: brand, url: state.brandUrl, followers },
    settings: state.settings,
    videos: ordered.map((item) =>
      toAnalyzedVideo(item, results.get(item.video.shortCode), state),
    ),
    conclusions,
  });
}
