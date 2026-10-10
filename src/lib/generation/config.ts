export const SORA_PRICE_PER_SECOND_USD = 0.1;
// OpenAI list prices per second of video at SORA_SIZE. A Map, so a model named like an Object property never matches.
const SORA_PRICES_PER_SECOND_USD = new Map<string, number>([
  ["sora-2", SORA_PRICE_PER_SECOND_USD],
  ["sora-2-pro", 0.3],
]);
export const SORA_SIZE = "720x1280" as const;
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

export const GENERATION_LIMITS = {
  hairstylesPerBrief: 5,
  takesPerScript: 3,
  totalSeconds: 120,
} as const;

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

export const totalVideoSeconds = (
  scriptCount: number,
  settings: GenerationSettings,
) => scriptCount * settings.takesPerScript * settings.seconds;

export const soraModel = () => process.env.SORA_MODEL || "sora-2";

/** Dated snapshots (sora-2-pro-2025-10-06) cost the same as their base model. Throws for a model with no known price. */
export function soraPricePerSecondUsd(model: string = soraModel()) {
  const price = SORA_PRICES_PER_SECOND_USD.get(
    model.replace(/-\d{4}-\d{2}-\d{2}$/, ""),
  );
  if (price === undefined) {
    throw new Error(
      `SORA_MODEL "${model}" has no known price. Use sora-2 or sora-2-pro.`,
    );
  }
  return price;
}

/**
 * Rounded to cents so 48 s reads as 4.8, not 4.800000000000001. The browser does not see SORA_MODEL,
 * so client code passes the price the server reports.
 */
export const estimateSoraCostUsd = (
  scriptCount: number,
  settings: GenerationSettings,
  pricePerSecondUsd: number = soraPricePerSecondUsd(),
) =>
  Math.round(
    totalVideoSeconds(scriptCount, settings) * pricePerSecondUsd * 100,
  ) / 100;
