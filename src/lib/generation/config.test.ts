import { zodTextFormat } from "openai/helpers/zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as config from "./config";
import {
  clampGenerationSettings,
  DEFAULT_GENERATION_SETTINGS,
  ESTIMATED_IMAGE_COST_USD,
  estimatePreviewCostUsd,
  FRAMES_PER_TAKE,
  GENERATION_LIMITS,
  type GenerationSettings,
  IMAGE_SIZE,
  imageModel,
  imageQuality,
  imageUsageCostUsd,
  totalImages,
} from "./config";
import {
  ScriptsResponseSchema,
  StoryboardFrameSchema,
  VideoScriptSchema,
} from "./schema";

describe("clampGenerationSettings", () => {
  it("falls back to the defaults on missing or invalid input", () => {
    expect(clampGenerationSettings()).toEqual(DEFAULT_GENERATION_SETTINGS);
    expect(clampGenerationSettings({})).toEqual(DEFAULT_GENERATION_SETTINGS);
    expect(
      clampGenerationSettings({
        hairstylesPerBrief: "abc",
        takesPerScript: -2,
        seconds: null,
      }),
    ).toEqual(DEFAULT_GENERATION_SETTINGS);
    expect(
      clampGenerationSettings({
        hairstylesPerBrief: 0,
        takesPerScript: Infinity,
        seconds: undefined,
      }),
    ).toEqual(DEFAULT_GENERATION_SETTINGS);
  });

  it("lowers but never raises the caps", () => {
    expect(
      clampGenerationSettings({
        hairstylesPerBrief: 50,
        takesPerScript: 9,
        seconds: 12,
      }),
    ).toEqual({
      hairstylesPerBrief: GENERATION_LIMITS.hairstylesPerBrief,
      takesPerScript: GENERATION_LIMITS.takesPerScript,
      seconds: 12,
    });
    expect(
      clampGenerationSettings({
        hairstylesPerBrief: "3",
        takesPerScript: 1.9,
        seconds: "4",
      }),
    ).toEqual({ hairstylesPerBrief: 3, takesPerScript: 1, seconds: 4 });
  });

  it("only accepts 4, 8 or 12 seconds", () => {
    for (const seconds of [4, 8, 12]) {
      expect(clampGenerationSettings({ seconds }).seconds).toBe(seconds);
    }
    for (const seconds of [0, 5, 10, 16, 8.5, "abc"]) {
      expect(clampGenerationSettings({ seconds }).seconds).toBe(
        DEFAULT_GENERATION_SETTINGS.seconds,
      );
    }
  });
});

describe("preview constants", () => {
  it("renders 3 portrait frames per take, at most 60 images per generation", () => {
    expect(IMAGE_SIZE).toBe("1024x1536");
    expect(FRAMES_PER_TAKE).toBe(3);
    expect(GENERATION_LIMITS).toEqual({
      hairstylesPerBrief: 5,
      takesPerScript: 3,
      totalImages: 60,
    });
    expect(ESTIMATED_IMAGE_COST_USD).toEqual({
      low: 0.004,
      medium: 0.035,
      high: 0.13,
    });
  });

  it("exports nothing Sora-specific", () => {
    const soraExports = Object.keys(config).filter((name) =>
      /sora|totalVideo/i.test(name),
    );
    expect(soraExports).toEqual([]);
  });
});

describe("image totals and estimates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("counts 3 frames for every take of every script", () => {
    expect(totalImages(3, DEFAULT_GENERATION_SETTINGS)).toBe(18);
    const settings: GenerationSettings = {
      hairstylesPerBrief: 5,
      takesPerScript: 3,
      seconds: 12,
    };
    expect(totalImages(15, settings)).toBe(135);
    expect(totalImages(0, settings)).toBe(0);
  });

  it("prices the Starter defaults per quality, rounded to cents", () => {
    // 18 images: 18 * 0.035 = 0.63, 18 * 0.004 = 0.072, 18 * 0.13 = 2.34.
    expect(
      estimatePreviewCostUsd(3, DEFAULT_GENERATION_SETTINGS, "medium"),
    ).toBe(0.63);
    expect(estimatePreviewCostUsd(3, DEFAULT_GENERATION_SETTINGS, "low")).toBe(
      0.07,
    );
    expect(estimatePreviewCostUsd(3, DEFAULT_GENERATION_SETTINGS, "high")).toBe(
      2.34,
    );
  });

  it("estimates with the PREVIEW_IMAGE_QUALITY price by default", () => {
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "");
    expect(estimatePreviewCostUsd(3, DEFAULT_GENERATION_SETTINGS)).toBe(0.63);
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "high");
    expect(estimatePreviewCostUsd(3, DEFAULT_GENERATION_SETTINGS)).toBe(2.34);
  });

  it("puts the cap on images, so the maximum settings exceed it", () => {
    const max: GenerationSettings = {
      hairstylesPerBrief: GENERATION_LIMITS.hairstylesPerBrief,
      takesPerScript: GENERATION_LIMITS.takesPerScript,
      seconds: 12,
    };
    // 20 scripts at 1 take fit exactly; 7 scripts at 3 takes do not.
    expect(
      totalImages(20, { ...max, takesPerScript: 1 }) <=
        GENERATION_LIMITS.totalImages,
    ).toBe(true);
    expect(totalImages(7, max) > GENERATION_LIMITS.totalImages).toBe(true);
    // The image count, not the clip length, drives the cap.
    expect(totalImages(5, { ...max, seconds: 4 })).toBe(totalImages(5, max));
  });
});

describe("imageModel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to gpt-image-2 and respects PREVIEW_IMAGE_MODEL", () => {
    vi.stubEnv("PREVIEW_IMAGE_MODEL", "");
    expect(imageModel()).toBe("gpt-image-2");
    vi.stubEnv("PREVIEW_IMAGE_MODEL", "gpt-image-1");
    expect(imageModel()).toBe("gpt-image-1");
  });
});

describe("imageQuality", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to medium and accepts low, medium or high", () => {
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "");
    expect(imageQuality()).toBe("medium");
    for (const quality of ["low", "medium", "high"]) {
      vi.stubEnv("PREVIEW_IMAGE_QUALITY", quality);
      expect(imageQuality()).toBe(quality);
    }
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", " High ");
    expect(imageQuality()).toBe("high");
  });

  it("rejects an unknown quality instead of guessing its price", () => {
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "ultra");
    expect(() => imageQuality()).toThrow(
      'PREVIEW_IMAGE_QUALITY "ultra" is not supported. Use low, medium or high.',
    );
    vi.stubEnv("PREVIEW_IMAGE_QUALITY", "constructor");
    expect(() => imageQuality()).toThrow("is not supported");
  });
});

describe("imageUsageCostUsd", () => {
  it("prices text input at $5, image input at $8 and image output at $30 per 1M tokens", () => {
    const usage = {
      input_tokens: 1_300,
      input_tokens_details: { text_tokens: 100, image_tokens: 1_200 },
      output_tokens: 1_056,
      total_tokens: 2_356,
    };
    // 100 * 5 + 1200 * 8 + 1056 * 30 = 500 + 9600 + 31680 = 41780 micro-dollars.
    expect(imageUsageCostUsd(usage)).toBeCloseTo(0.04178, 10);
  });

  it("prices a text-only generate call", () => {
    expect(
      imageUsageCostUsd({
        input_tokens: 200,
        input_tokens_details: { text_tokens: 200, image_tokens: 0 },
        output_tokens: 4_160,
        output_tokens_details: { image_tokens: 4_160, text_tokens: 0 },
        total_tokens: 4_360,
      }),
    ).toBeCloseTo(0.001 + 0.1248, 10);
  });

  it("treats input tokens without details as text and missing usage as free", () => {
    expect(
      imageUsageCostUsd({
        input_tokens: 1_000,
        output_tokens: 0,
        total_tokens: 1_000,
      } as Parameters<typeof imageUsageCostUsd>[0]),
    ).toBeCloseTo(0.005, 10);
    expect(imageUsageCostUsd(undefined)).toBe(0);
    expect(imageUsageCostUsd(null)).toBe(0);
  });
});

describe("script schemas", () => {
  const storyboard = [
    { label: "hook", atSecond: 0, imagePrompt: "Close-up of flakes." },
    { label: "product", atSecond: 4, imagePrompt: "Lathering a bottle." },
    { label: "reveal", atSecond: 7.5, imagePrompt: "Sleek low bun." },
  ];
  const script = {
    briefIndex: 0,
    hairstyle: "Sleek low bun",
    title: "Flake-free bun",
    format: "before_after",
    videoPrompt: "A vertical video of a fictional woman in her 20s.",
    storyboard,
    onScreenText: ["Day 1"],
    voiceover: "No more flakes.",
    emotionalTriggers: ["confidence"],
    rationale: "Keeps the before/after hook.",
  };

  it("converts to a strict OpenAI text format", () => {
    const format = zodTextFormat(ScriptsResponseSchema, "video_scripts");
    expect(format.strict).toBe(true);
    expect(format.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["scripts"],
    });
    const scriptSchema = (
      format.schema as {
        properties: {
          scripts: {
            items: {
              additionalProperties: boolean;
              required: string[];
              properties: Record<string, unknown>;
            };
          };
        };
      }
    ).properties.scripts.items;
    expect(scriptSchema.additionalProperties).toBe(false);
    expect([...scriptSchema.required].sort()).toEqual(
      Object.keys(script).sort(),
    );
    expect(scriptSchema.properties.storyboard).toMatchObject({
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "atSecond", "imagePrompt"],
        properties: { label: { enum: ["hook", "product", "reveal"] } },
      },
    });
  });

  it("requires every script field", () => {
    expect(VideoScriptSchema.parse(script)).toEqual(script);
    expect(
      VideoScriptSchema.safeParse({ ...script, voiceover: undefined }).success,
    ).toBe(false);
    expect(
      VideoScriptSchema.safeParse({ ...script, format: "unboxing" }).success,
    ).toBe(false);
    expect(
      VideoScriptSchema.safeParse({ ...script, storyboard: undefined }).success,
    ).toBe(false);
    const { videoPrompt, ...withoutVideoPrompt } = script;
    expect(
      VideoScriptSchema.safeParse({
        ...withoutVideoPrompt,
        soraPrompt: videoPrompt,
      }).success,
    ).toBe(false);
  });

  it("accepts only hook, product and reveal frames", () => {
    expect(StoryboardFrameSchema.parse(storyboard[0])).toEqual(storyboard[0]);
    expect(
      StoryboardFrameSchema.safeParse({ ...storyboard[0], label: "intro" })
        .success,
    ).toBe(false);
    expect(
      StoryboardFrameSchema.safeParse({ ...storyboard[0], atSecond: "0" })
        .success,
    ).toBe(false);
  });
});
