import { zodTextFormat } from "openai/helpers/zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampGenerationSettings,
  DEFAULT_GENERATION_SETTINGS,
  estimateSoraCostUsd,
  GENERATION_LIMITS,
  type GenerationSettings,
  soraModel,
  soraPricePerSecondUsd,
  totalVideoSeconds,
} from "./config";
import { ScriptsResponseSchema, VideoScriptSchema } from "./schema";

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

describe("video totals", () => {
  it("prices the Starter defaults at $4.80", () => {
    expect(totalVideoSeconds(3, DEFAULT_GENERATION_SETTINGS)).toBe(48);
    expect(estimateSoraCostUsd(3, DEFAULT_GENERATION_SETTINGS)).toBe(4.8);
  });

  it("counts every take of every script", () => {
    const settings: GenerationSettings = {
      hairstylesPerBrief: 5,
      takesPerScript: 3,
      seconds: 12,
    };
    expect(totalVideoSeconds(15, settings)).toBe(540);
    expect(estimateSoraCostUsd(15, settings)).toBe(54);
  });
});

describe("soraPricePerSecondUsd", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prices the configured model, including dated snapshots", () => {
    expect(soraPricePerSecondUsd("sora-2")).toBe(0.1);
    expect(soraPricePerSecondUsd("sora-2-2025-12-08")).toBe(0.1);
    expect(soraPricePerSecondUsd("sora-2-pro")).toBe(0.3);
    expect(soraPricePerSecondUsd("sora-2-pro-2025-10-06")).toBe(0.3);
  });

  it("estimates with the SORA_MODEL price, so sora-2-pro is not shown at a third of its cost", () => {
    vi.stubEnv("SORA_MODEL", "sora-2-pro");
    expect(soraPricePerSecondUsd()).toBe(0.3);
    expect(estimateSoraCostUsd(3, DEFAULT_GENERATION_SETTINGS)).toBe(14.4);
    expect(estimateSoraCostUsd(3, DEFAULT_GENERATION_SETTINGS, 0.1)).toBe(4.8);
  });

  it("rejects a model with no known price", () => {
    expect(() => soraPricePerSecondUsd("sora-3")).toThrow(
      'SORA_MODEL "sora-3" has no known price. Use sora-2 or sora-2-pro.',
    );
    expect(() => soraPricePerSecondUsd("constructor")).toThrow(
      "no known price",
    );
  });
});

describe("soraModel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to sora-2 and respects SORA_MODEL", () => {
    vi.stubEnv("SORA_MODEL", "");
    expect(soraModel()).toBe("sora-2");
    vi.stubEnv("SORA_MODEL", "sora-2-pro");
    expect(soraModel()).toBe("sora-2-pro");
  });
});

describe("script schemas", () => {
  it("converts to a strict OpenAI text format", () => {
    const format = zodTextFormat(ScriptsResponseSchema, "video_scripts");
    expect(format.strict).toBe(true);
    expect(format.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["scripts"],
    });
  });

  it("requires every script field", () => {
    const script = {
      briefIndex: 0,
      hairstyle: "Sleek low bun",
      title: "Flake-free bun",
      format: "before_after",
      soraPrompt: "A vertical video of a fictional woman in her 20s.",
      onScreenText: ["Day 1"],
      voiceover: "No more flakes.",
      emotionalTriggers: ["confidence"],
      rationale: "Keeps the before/after hook.",
    };
    expect(VideoScriptSchema.parse(script)).toEqual(script);
    expect(
      VideoScriptSchema.safeParse({ ...script, voiceover: undefined }).success,
    ).toBe(false);
    expect(
      VideoScriptSchema.safeParse({ ...script, format: "unboxing" }).success,
    ).toBe(false);
  });
});
