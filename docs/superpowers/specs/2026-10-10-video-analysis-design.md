# Part 1 — Influencer Video Analysis: Design

Status: approved in conversation, pending written-spec review
Owner: Ismael
Consumer: Part 2 (video generation, Aditi) reads the `BrandAnalysis` JSON this produces.
Scope: hair care and styling brands on Instagram.

## 1. Goal

Paste a hair care brand's Instagram URL. Get back:

- every influencer video on the brand page, tiered **Amplify / Observe / Stop**;
- an AI description and video type for each tiered video;
- an emotion analysis of each video's comments;
- conclusions about what makes videos succeed or fail, including replication briefs that Part 2 turns into new video scripts.

Success: one run on a real brand completes end to end, the page shows tiers, per-video analysis, emotions and conclusions, and `analysis.json` downloads in the documented shape.

## 2. Definitions

- **Brand page**: the Instagram profile the user pastes.
- **Influencer video**: a video on the brand page that is either
  - a **collab** post: `coauthorProducers` contains a user other than the brand (the same post appears on both profiles with shared metrics), or
  - a **credited** post: no co-author, but a creator is credited via `taggedUsers`, `sponsors`, or a caption credit (`🎥 @name`, `📹 @name`, `via @name`, `by @name`, `credit: @name`, `cc @name`). First match in that order wins. The brand's own handle is never a creator.
- **Metrics** of a video: `views` (`videoPlayCount ?? videoViewCount`), `likes` (`likesCount`, ignored when `-1` = hidden), `comments` (`commentsCount`). A credited post uses the brand post's own metrics for both comparisons.
- **Baseline** of a page for video `v`: the median of each metric over that page's other videos (videos only, `v` excluded). Brand baseline includes other influencer videos.
- **Page score**: `ratio_m = (v_m + 1) / (median_m + 1)` for each available metric `m`; `pageScore = geometric mean of the ratios`. A video **beats** a page when `pageScore > 1`.
- **Tiers**:
  - **Amplify**: beats the brand page AND the influencer page.
  - **Observe**: beats exactly one of the two.
  - **Stop**: beats neither.
  - `insufficient_data`: either page has fewer than 5 other videos. Shown, not AI-analyzed.
  - Videos younger than 3 days are excluded (`too_recent`) because their metrics are still growing.
- **Rank within tier**: by `min(brandScore, influencerScore)`, descending.

## 3. Pipeline

Pure TypeScript module under `src/lib/analysis/`, callable from the background job runner and from the CLI (`pnpm analyze <url>`). Every stage writes its output to the cache; re-running a run skips completed work.

1. **scrapeBrand**: Apify `apify/instagram-scraper`, `resultsType: "details"` for the profile (followers) and `resultsType: "posts"` for the last `brandPostLimit` (default 100) posts. Keep videos.
2. **detectInfluencerVideos**: apply the definition in §2 to each brand video.
3. **scrapeInfluencers**: unique creators, capped at `maxCreators` (default 25, ordered by number of brand videos they appear in, then most recent). One Apify run, all profile URLs as `directUrls`, `resultsLimit: creatorPostLimit` (default 50). Keep videos.
4. **scoreVideos**: compute baselines, page scores, tiers, ranks (§2).
5. **fetchComments**: one Apify run with `resultsType: "comments"` over all tiered videos (`directUrls` = post URLs), up to 15 newest per video (free plan limit).
6. **analyzeVideo** (per tiered video, concurrency 4):
   1. download the mp4 from `videoUrl` (Instagram CDN links expire, so this happens during the run);
   2. select frames: scene changes (ffmpeg `select='gt(scene,0.3)'`), plus hook frames at 0.0 s, 1.0 s, 2.0 s, plus the last frame; deduplicate frames closer than 0.5 s; cap at 24 by keeping hook and last frames and sampling the rest evenly;
   3. extract audio as mono mp3; skip when the video has no audio stream;
   4. transcribe audio with OpenAI;
   5. send frames (with timestamps), transcript, caption and creator handle to an OpenAI vision model; validate against `VideoAnalysis`.
7. **analyzeComments** (per tiered video): OpenAI, validated against `CommentAnalysis`. Skipped when the video has zero comments.
8. **concludeInsights**: one OpenAI call with all analyses grouped by tier; validated against `Conclusions`.

Failure of one video in stages 6–7 marks that video `failed` with the error and the run continues. Failure of a whole stage (1–5, 8) marks the run `failed`. Retrying a run resumes from cache.

## 4. AI outputs (Zod schemas in `src/lib/analysis/schema.ts`)

All calls use OpenAI structured outputs with these schemas. Models come from env (`OPENAI_VISION_MODEL`, `OPENAI_TRANSCRIBE_MODEL`); defaults are set from OpenAI's current docs at implementation time.

### VideoAnalysis

- `videoType`: `before_after | tutorial | product_demo | routine_grwm | review_testimonial | transformation_reveal | lifestyle | comparison | trend_humor | other`
- `description`: precise beat-by-beat summary with timestamps
- `hook`: `{ description, whyItWorks }` for the first 3 seconds
- `hairstyle`: `{ hairType, length, styleAchieved, techniques[] }`
- `products`: `[{ name, howUsed }]`
- `onScreenText[]`, `audio` (`voiceover | music | trending_sound | mixed | none` + summary), `pacing` (`{ cutsCount, durationSeconds, feel }`), `tone`

### CommentAnalysis

- `emotions`: share (0–1, sums to 1) per `admiration | desire_to_buy | trust | curiosity_question | relatability | excitement | humor | skepticism | disappointment | neutral`
- `dominantEmotion`, `themes[]`, `questions[]`, `purchaseIntent` (`low | medium | high`)
- `quotes[]`: up to 3 representative comments, verbatim

### Conclusions

- `amplifyPatterns[]`, `stopPatterns[]`, `observeNotes[]`: `{ pattern, evidence, videoIds[] }`
- `emotionalTriggers`: `{ amplify[], stop[] }`
- `replicationBriefs[]`: `{ sourceVideoIds[], format (videoType), hook, structureBeats[], emotionalTriggers[], productRole, hairstyleVariations[] (3–5) }`

## 5. Hand-off contract: `BrandAnalysis`

Written to `.data/runs/<runId>/analysis.json` and downloadable from the UI. The TypeScript type and Zod schema are exported from `src/lib/analysis/schema.ts` for Part 2.

```
BrandAnalysis {
  schemaVersion: 1
  generatedAt
  brand: { username, url, followers }
  settings: { brandPostLimit, maxCreators, creatorPostLimit }
  videos: [{
    id, shortCode, url, creator, source: "collab" | "credited",
    postedAt, durationSeconds, caption,
    metrics: { views, likes | null, comments },
    brandScore, influencerScore, ratios: { brand: {…}, influencer: {…} },
    tier: "amplify" | "observe" | "stop" | "insufficient_data" | "too_recent",
    rank,
    status: "analyzed" | "failed" | "skipped", error?,
    transcript?, videoAnalysis?, commentAnalysis?
  }]
  conclusions: Conclusions | null
}
```

## 6. Storage

`.data/` at the repo root, git-ignored. No database.

- `runs/<runId>/run.json`: status (`queued | running | completed | failed`), stage progress, per-video progress, errors, Apify spend.
- `runs/<runId>/analysis.json`: final `BrandAnalysis`.
- `cache/apify/<sha256 of actor input>.json`: raw scrape results.
- `cache/media/<shortCode>/`: `video.mp4`, `frames/<ms>.jpg`, `audio.mp3`.
- `cache/ai/<shortCode>.<stage>.v<promptVersion>.json`: AI outputs; bumping a prompt version re-runs only that stage.

## 7. Server and UI

- `POST /api/runs` `{ brandUrl, caps? }`: validate, create run, start the pipeline in the background (not awaited). A running run for the same brand is returned instead of starting a second.
- `GET /api/runs`: list runs. `GET /api/runs/:id`: `run.json` plus `analysis.json` when complete.
- `GET /api/media/:shortCode/frames/:file`: serve cached frames.
- `/analyze`: brand URL input, caps, cost estimate, Start button, list of past runs.
- `/analyze/[runId]`: polls every 2 s. Progress checklist while running. When complete: Amplify / Observe / Stop tables with both scores; per-video cards (key frames, type, description, emotion bar, quotes); conclusions panel; "Download JSON".
- The existing prototype `/instagram` page is removed; its Apify client moves to `src/lib/analysis/apify.ts`.

Requires a long-running Node server (`pnpm dev` or `pnpm build && pnpm start`). Not designed for serverless.

## 8. Configuration, caps and cost

- Env: `APIFY_TOKEN`, `OPENAI_API_KEY` (both required; run fails fast when missing), optional `OPENAI_VISION_MODEL`, `OPENAI_TRANSCRIBE_MODEL`.
- Hard caps (UI may lower, never raise): `brandPostLimit ≤ 100`, `maxCreators ≤ 25`, `creatorPostLimit ≤ 50`, comments ≤ 15 per video.
- Every Apify run sets `maxItems` and `maxTotalChargeUsd` from its expected result count × $0.0027 + $0.05.
- Expected cost per brand at default caps: Apify ≈ $3–6, OpenAI ≈ $2–5. The UI shows the Apify estimate before starting.
- ffmpeg comes from the `ffmpeg-static` package; `FFMPEG_PATH` overrides it.

## 9. Testing

- Vitest unit tests (no network): scoring and tiering, influencer detection and caption credit parsing, frame timestamp selection, Apify item normalization, schema validation.
- Fixtures: one small real run (5 creators, cost < $1) recorded under `src/lib/analysis/__fixtures__/`.
- CI adds `pnpm test`.

## 10. Out of scope

- Part 2 (script and video generation).
- Paid metrics (spend, CPM, CTR, ROAS).
- Authentication; the app is for local use during the hackathon.
- More than 15 comments per video (requires a paid Apify plan).
