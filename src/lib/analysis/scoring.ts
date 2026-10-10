import { MIN_BASELINE_VIDEOS, MIN_VIDEO_AGE_DAYS } from "./config";
import type { CreatorMatch } from "./influencers";
import type { InstagramVideo } from "./instagram";
import type { Tier } from "./schema";

export type MetricRatios = {
  views: number;
  likes: number | null;
  comments: number;
};
export type PageComparison = { score: number; ratios: MetricRatios };

export type ScoredVideo = {
  video: InstagramVideo;
  creator: string;
  source: CreatorMatch["source"];
  brand: PageComparison | null;
  influencer: PageComparison | null;
  tier: Tier;
  rank: number | null;
};

const DAY_MS = 86_400_000;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const ratio = (value: number, baseline: number[]) =>
  (value + 1) / (median(baseline) + 1);

export function comparePage(
  video: InstagramVideo,
  pageVideos: InstagramVideo[],
): PageComparison | null {
  const others = pageVideos.filter(
    (other) => other.shortCode !== video.shortCode,
  );
  if (others.length < MIN_BASELINE_VIDEOS) return null;
  const visibleLikes = others.flatMap((other) =>
    other.likes === null ? [] : [other.likes],
  );
  const ratios: MetricRatios = {
    views: ratio(
      video.views,
      others.map((other) => other.views),
    ),
    likes:
      video.likes === null || visibleLikes.length === 0
        ? null
        : ratio(video.likes, visibleLikes),
    comments: ratio(
      video.comments,
      others.map((other) => other.comments),
    ),
  };
  const present = [
    ratios.views,
    ratios.comments,
    ...(ratios.likes === null ? [] : [ratios.likes]),
  ];
  const score = Math.exp(
    present.reduce((sum, value) => sum + Math.log(value), 0) / present.length,
  );
  return { score, ratios };
}

// Young videos' metrics are still growing. `now` is when the metrics were scraped.
export const isTooRecent = (video: InstagramVideo, now: Date) =>
  (now.getTime() - Date.parse(video.postedAt)) / DAY_MS < MIN_VIDEO_AGE_DAYS;

export function tierFor(
  video: InstagramVideo,
  brand: PageComparison | null,
  influencer: PageComparison | null,
  now: Date,
): Tier {
  if (isTooRecent(video, now)) return "too_recent";
  if (!brand || !influencer) return "insufficient_data";
  const wins = Number(brand.score > 1) + Number(influencer.score > 1);
  return wins === 2 ? "amplify" : wins === 1 ? "observe" : "stop";
}

export function scoreVideos(input: {
  influencerVideos: { video: InstagramVideo; match: CreatorMatch }[];
  brandVideos: InstagramVideo[];
  creatorVideos: Map<string, InstagramVideo[]>;
  now: Date;
}): ScoredVideo[] {
  const scored: ScoredVideo[] = input.influencerVideos.map(
    ({ video, match }) => {
      const brand = comparePage(video, input.brandVideos);
      const influencer = comparePage(
        video,
        input.creatorVideos.get(match.creator) ?? [],
      );
      return {
        video,
        creator: match.creator,
        source: match.source,
        brand,
        influencer,
        tier: tierFor(video, brand, influencer, input.now),
        rank: null,
      };
    },
  );
  // A video that wins on both pages ranks above one that wins big on only one.
  const strength = (item: ScoredVideo) =>
    Math.min(item.brand?.score ?? 0, item.influencer?.score ?? 0);
  for (const tier of ["amplify", "observe", "stop"] as const) {
    scored
      .filter((item) => item.tier === tier)
      .sort((a, b) => strength(b) - strength(a))
      .forEach((item, index) => {
        item.rank = index + 1;
      });
  }
  return scored;
}
