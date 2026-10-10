import type { ImagesResponse } from "openai/resources/images";

export const VIDEO_SECONDS = [4, 8, 12] as const;
export type VideoLength = (typeof VIDEO_SECONDS)[number];

export type GenerationSettings = {
  hairstylesPerBrief: number;
  takesPerScript: number;
  seconds: VideoLength;
};

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  hairstylesPerBrief: 1,
  takesPerScript: 2,
  seconds: 8,
};

/** Portrait size closest to 9:16 that the image models support. */
export const IMAGE_SIZE = "1024x1536" as const;
/** Each take is a storyboard of hook, product and reveal frames. */
export const FRAMES_PER_TAKE = 3;

export const GENERATION_LIMITS = {
  hairstylesPerBrief: 5,
  takesPerScript: 3,
  totalImages: 60,
} as const;

export const IMAGE_QUALITIES = ["low", "medium", "high"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

/** Pre-run estimate per IMAGE_SIZE image. The real cost comes from each response's usage. */
export const ESTIMATED_IMAGE_COST_USD: Readonly<Record<ImageQuality, number>> =
  {
    low: 0.004,
    medium: 0.035,
    high: 0.13,
  };

// Token list prices per 1M tokens for the image model.
const TEXT_INPUT_USD_PER_TOKEN = 5 / 1_000_000;
const IMAGE_INPUT_USD_PER_TOKEN = 8 / 1_000_000;
const IMAGE_OUTPUT_USD_PER_TOKEN = 30 / 1_000_000;

/** Invalid values fall back to the default (cheapest), never to the cap. */
export function clampGenerationSettings(
  input: Partial<Record<keyof GenerationSettings, unknown>> = {},
): GenerationSettings {
  const clamp = (value: unknown, max: number, fallback: number) => {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= 1
      ? Math.min(number, max)
      : fallback;
  };
  const seconds = Number(input.seconds);
  return {
    hairstylesPerBrief: clamp(
      input.hairstylesPerBrief,
      GENERATION_LIMITS.hairstylesPerBrief,
      DEFAULT_GENERATION_SETTINGS.hairstylesPerBrief,
    ),
    takesPerScript: clamp(
      input.takesPerScript,
      GENERATION_LIMITS.takesPerScript,
      DEFAULT_GENERATION_SETTINGS.takesPerScript,
    ),
    seconds: (VIDEO_SECONDS as readonly number[]).includes(seconds)
      ? (seconds as VideoLength)
      : DEFAULT_GENERATION_SETTINGS.seconds,
  };
}

export const totalImages = (
  scriptCount: number,
  settings: GenerationSettings,
) => scriptCount * settings.takesPerScript * FRAMES_PER_TAKE;

export const imageModel = () =>
  process.env.PREVIEW_IMAGE_MODEL || "gpt-image-2";

/** Defaults to medium. Throws for an unknown quality rather than guessing its price. */
export function imageQuality(): ImageQuality {
  const raw = process.env.PREVIEW_IMAGE_QUALITY ?? "";
  const quality = raw.trim().toLowerCase();
  if (!quality) return "medium";
  if (!(IMAGE_QUALITIES as readonly string[]).includes(quality)) {
    throw new Error(
      `PREVIEW_IMAGE_QUALITY "${raw}" is not supported. Use low, medium or high.`,
    );
  }
  return quality as ImageQuality;
}

/**
 * Rounded to cents so 18 images read as 0.63, not 0.6300000000000001. The browser does not see
 * PREVIEW_IMAGE_QUALITY, so client code passes the quality the server reports.
 */
export const estimatePreviewCostUsd = (
  scriptCount: number,
  settings: GenerationSettings,
  quality: ImageQuality = imageQuality(),
) =>
  Math.round(
    totalImages(scriptCount, settings) *
      ESTIMATED_IMAGE_COST_USD[quality] *
      100,
  ) / 100;

/**
 * Real cost of one images.generate or images.edit call, not rounded so a take's frames can be summed.
 * Input tokens without details count as text; every output token counts as an image token.
 * A response without usage costs 0.
 */
export function imageUsageCostUsd(
  usage: ImagesResponse.Usage | null | undefined,
): number {
  if (!usage) return 0;
  const imageInput = usage.input_tokens_details?.image_tokens ?? 0;
  const textInput =
    usage.input_tokens_details?.text_tokens ??
    Math.max(0, usage.input_tokens - imageInput);
  return (
    textInput * TEXT_INPUT_USD_PER_TOKEN +
    imageInput * IMAGE_INPUT_USD_PER_TOKEN +
    usage.output_tokens * IMAGE_OUTPUT_USD_PER_TOKEN
  );
}
