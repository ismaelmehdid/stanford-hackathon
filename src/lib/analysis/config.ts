export const APIFY_PRICE_PER_RESULT_USD = 0.0027;

export type RunSettings = {
  brandPostLimit: number;
  maxCreators: number;
  creatorPostLimit: number;
};

export const MAX_SETTINGS: RunSettings = {
  brandPostLimit: 100,
  maxCreators: 25,
  creatorPostLimit: 50,
};

export const MIN_BASELINE_VIDEOS = 5;
export const MIN_VIDEO_AGE_DAYS = 3;
export const VIDEO_CONCURRENCY = 4;
export const MAX_FRAMES = 24;
export const MAX_COMMENTS = 15;

export function clampSettings(
  input: Partial<Record<keyof RunSettings, unknown>> = {},
): RunSettings {
  const clamp = (value: unknown, max: number) => {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= 1 ? Math.min(number, max) : max;
  };
  return {
    brandPostLimit: clamp(input.brandPostLimit, MAX_SETTINGS.brandPostLimit),
    maxCreators: clamp(input.maxCreators, MAX_SETTINGS.maxCreators),
    creatorPostLimit: clamp(
      input.creatorPostLimit,
      MAX_SETTINGS.creatorPostLimit,
    ),
  };
}

// One profile-details result, the brand feed, and every creator feed.
export function estimateApifyCostUsd(settings: RunSettings) {
  const results =
    1 +
    settings.brandPostLimit +
    settings.maxCreators * settings.creatorPostLimit;
  return results * APIFY_PRICE_PER_RESULT_USD;
}

export function requireEnv(name: "APIFY_TOKEN" | "OPENAI_API_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.`);
  return value;
}

export const visionModel = () => process.env.OPENAI_VISION_MODEL || "gpt-5.5";
export const transcribeModel = () =>
  process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
