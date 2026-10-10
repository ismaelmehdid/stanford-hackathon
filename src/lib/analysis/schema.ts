import { z } from "zod";
import type { RunSettings } from "./config";

export const VIDEO_TYPES = [
  "before_after",
  "tutorial",
  "product_demo",
  "routine_grwm",
  "review_testimonial",
  "transformation_reveal",
  "lifestyle",
  "comparison",
  "trend_humor",
  "other",
] as const;

export const EMOTIONS = [
  "admiration",
  "desire_to_buy",
  "trust",
  "curiosity_question",
  "relatability",
  "excitement",
  "humor",
  "skepticism",
  "disappointment",
  "neutral",
] as const;

export const TIERS = [
  "amplify",
  "observe",
  "stop",
  "insufficient_data",
  "too_recent",
] as const;
export const ANALYZED_TIERS = ["amplify", "observe", "stop"] as const;

export type Tier = (typeof TIERS)[number];
export type Emotion = (typeof EMOTIONS)[number];

export const isAnalyzedTier = (
  tier: Tier,
): tier is (typeof ANALYZED_TIERS)[number] =>
  (ANALYZED_TIERS as readonly Tier[]).includes(tier);

export const VideoAnalysisSchema = z.object({
  videoType: z.enum(VIDEO_TYPES),
  description: z
    .string()
    .describe(
      "Beat-by-beat summary, one line per beat, each starting with its timestamp",
    ),
  hook: z.object({ description: z.string(), whyItWorks: z.string() }),
  hairstyle: z.object({
    hairType: z.string(),
    length: z.string(),
    styleAchieved: z.string(),
    techniques: z.array(z.string()),
  }),
  products: z.array(z.object({ name: z.string(), howUsed: z.string() })),
  onScreenText: z.array(z.string()),
  audio: z.object({
    kind: z.enum(["voiceover", "music", "trending_sound", "mixed", "none"]),
    summary: z.string(),
  }),
  pacing: z.object({
    cutsCount: z.number(),
    durationSeconds: z.number(),
    feel: z.string(),
  }),
  tone: z.string(),
});

export const EmotionSharesSchema = z.object({
  admiration: z.number(),
  desire_to_buy: z.number(),
  trust: z.number(),
  curiosity_question: z.number(),
  relatability: z.number(),
  excitement: z.number(),
  humor: z.number(),
  skepticism: z.number(),
  disappointment: z.number(),
  neutral: z.number(),
});

export const CommentAnalysisSchema = z.object({
  emotions: EmotionSharesSchema.describe(
    "Share of comments per emotion, each between 0 and 1, summing to 1",
  ),
  dominantEmotion: z.enum(EMOTIONS),
  themes: z.array(z.string()),
  questions: z.array(z.string()),
  purchaseIntent: z.enum(["low", "medium", "high"]),
  quotes: z
    .array(z.string())
    .describe("Up to 3 comments copied exactly from the input"),
});

const PatternSchema = z.object({
  pattern: z.string(),
  evidence: z.string(),
  videoIds: z.array(z.string()),
});

export const ConclusionsSchema = z.object({
  amplifyPatterns: z.array(PatternSchema),
  stopPatterns: z.array(PatternSchema),
  observeNotes: z.array(PatternSchema),
  emotionalTriggers: z.object({
    amplify: z.array(z.string()),
    stop: z.array(z.string()),
  }),
  replicationBriefs: z.array(
    z.object({
      basedOnTier: z
        .enum(["amplify", "observe"])
        .describe("observe only when the brand has no amplify videos"),
      sourceVideoIds: z.array(z.string()),
      format: z.enum(VIDEO_TYPES),
      hook: z.string(),
      structureBeats: z.array(z.string()),
      emotionalTriggers: z.array(z.string()),
      productRole: z.string(),
      hairstyleVariations: z
        .array(z.string())
        .describe("3 to 5 different hairstyles"),
    }),
  ),
});

const MetricRatiosSchema = z.object({
  views: z.number(),
  likes: z.number().nullable(),
  comments: z.number(),
});

export const AnalyzedVideoSchema = z.object({
  id: z.string(),
  shortCode: z.string(),
  url: z.string(),
  creator: z.string(),
  source: z.enum(["collab", "credited"]),
  postedAt: z.string(),
  durationSeconds: z.number().nullable(),
  caption: z.string(),
  metrics: z.object({
    views: z.number(),
    likes: z.number().nullable(),
    comments: z.number(),
  }),
  brandScore: z.number().nullable(),
  influencerScore: z.number().nullable(),
  ratios: z.object({
    brand: MetricRatiosSchema.nullable(),
    influencer: MetricRatiosSchema.nullable(),
  }),
  tier: z.enum(TIERS),
  rank: z.number().nullable(),
  status: z.enum(["analyzed", "failed", "skipped"]),
  error: z.string().nullable(),
  frames: z.array(z.object({ timestampSeconds: z.number(), file: z.string() })),
  transcript: z.string().nullable(),
  videoAnalysis: VideoAnalysisSchema.nullable(),
  commentAnalysis: CommentAnalysisSchema.nullable(),
});

export const BrandAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  brand: z.object({
    username: z.string(),
    url: z.string(),
    followers: z.number().nullable(),
  }),
  settings: z.object({
    brandPostLimit: z.number(),
    maxCreators: z.number(),
    creatorPostLimit: z.number(),
  }),
  videos: z.array(AnalyzedVideoSchema),
  conclusions: ConclusionsSchema.nullable(),
});

export type VideoAnalysis = z.infer<typeof VideoAnalysisSchema>;
export type CommentAnalysis = z.infer<typeof CommentAnalysisSchema>;
export type Conclusions = z.infer<typeof ConclusionsSchema>;
export type AnalyzedVideo = z.infer<typeof AnalyzedVideoSchema>;
export type BrandAnalysis = z.infer<typeof BrandAnalysisSchema>;

export const STAGES = [
  "scrapeBrand",
  "detectInfluencers",
  "scrapeCreators",
  "score",
  "analyzeVideos",
  "conclude",
] as const;
export type StageName = (typeof STAGES)[number];

export const STAGE_LABELS: Record<StageName, string> = {
  scrapeBrand: "Scrape brand page",
  detectInfluencers: "Find influencer videos",
  scrapeCreators: "Scrape influencer pages",
  score: "Score and tier videos",
  analyzeVideos: "Analyze videos and comments",
  conclude: "Draw conclusions",
};

export type VideoProgress = {
  shortCode: string;
  creator: string;
  tier: Tier;
  status: "pending" | "running" | "analyzed" | "failed" | "skipped";
  error: string | null;
};

export type RunState = {
  id: string;
  brandUsername: string;
  brandUrl: string;
  settings: RunSettings;
  status: "queued" | "running" | "completed" | "failed";
  // Process executing the run (the server or the CLI), used to detect abandoned runs.
  pid?: number;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  stages: Record<
    StageName,
    { status: "pending" | "running" | "done" | "failed"; detail: string | null }
  >;
  videos: VideoProgress[];
  apifySpendUsd: number;
};
