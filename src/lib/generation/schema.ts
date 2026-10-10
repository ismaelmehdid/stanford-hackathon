import { z } from "zod";
import { VIDEO_TYPES } from "@/lib/analysis/schema";
import type { GenerationSettings } from "./config";

export const VideoScriptSchema = z.object({
  briefIndex: z.number(),
  hairstyle: z.string(),
  title: z.string(),
  format: z.enum(VIDEO_TYPES),
  soraPrompt: z
    .string()
    .describe(
      "One self-contained prompt for a vertical video: subject, setting, camera, lighting, timed action, audio",
    ),
  onScreenText: z.array(z.string()),
  voiceover: z.string(),
  emotionalTriggers: z.array(z.string()),
  rationale: z.string(),
});

export const ScriptsResponseSchema = z.object({
  scripts: z.array(VideoScriptSchema),
});

export type VideoScript = z.infer<typeof VideoScriptSchema> & { id: string };

export type Take = {
  index: number;
  status: "pending" | "running" | "completed" | "failed";
  soraVideoId: string | null;
  file: string | null;
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
  scripts: ScriptEntry[];
  picks: Record<string, number>;
};
