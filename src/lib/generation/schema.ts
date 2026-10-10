import { z } from "zod";
import { VIDEO_TYPES } from "@/lib/analysis/schema";
import type { GenerationSettings } from "./config";

export const STORYBOARD_LABELS = ["hook", "product", "reveal"] as const;
export type StoryboardLabel = (typeof STORYBOARD_LABELS)[number];

export const StoryboardFrameSchema = z.object({
  label: z.enum(STORYBOARD_LABELS),
  atSecond: z.number().describe("The second of the clip this frame shows"),
  imagePrompt: z
    .string()
    .describe(
      "One self-contained prompt for a photographic vertical 9:16 frame: the same fictional adult, setting and lighting as the other frames",
    ),
});

export type StoryboardFrame = z.infer<typeof StoryboardFrameSchema>;

export const VideoScriptSchema = z.object({
  briefIndex: z.number(),
  hairstyle: z.string(),
  title: z.string(),
  format: z.enum(VIDEO_TYPES),
  videoPrompt: z
    .string()
    .describe(
      "One self-contained prompt for a vertical video: subject, setting, camera, lighting, timed action, audio",
    ),
  storyboard: z
    .array(StoryboardFrameSchema)
    .describe("Exactly 3 frames, in order: hook, product, reveal"),
  onScreenText: z.array(z.string()),
  voiceover: z.string(),
  emotionalTriggers: z.array(z.string()),
  rationale: z.string(),
});

export const ScriptsResponseSchema = z.object({
  scripts: z.array(VideoScriptSchema),
});

export type VideoScript = z.infer<typeof VideoScriptSchema> & { id: string };

/** file is null until the frame is rendered. */
export type TakeFrame = {
  label: StoryboardLabel;
  atSecond: number;
  file: string | null;
};

export type Take = {
  index: number;
  status: "pending" | "running" | "completed" | "failed";
  frames: TakeFrame[];
  costUsd: number | null;
  error: string | null;
};

export type ScriptEntry = { script: VideoScript; takes: Take[] };

export type GenerationState = {
  id: string;
  sourceId: string;
  brand: string;
  briefIndexes: number[];
  settings: GenerationSettings;
  status: "queued" | "running" | "completed" | "failed";
  stage: "scripts" | "videos" | "done";
  createdAt: string;
  updatedAt: string;
  error: string | null;
  pid?: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  scripts: ScriptEntry[];
  picks: Record<string, number>;
};
