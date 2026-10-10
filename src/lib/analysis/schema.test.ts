import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";
import {
  BrandAnalysisSchema,
  CommentAnalysisSchema,
  ConclusionsSchema,
  VideoAnalysisSchema,
} from "./schema";

describe("AI schemas", () => {
  it.each([
    ["video_analysis", VideoAnalysisSchema],
    ["comment_analysis", CommentAnalysisSchema],
    ["conclusions", ConclusionsSchema],
  ])("%s converts to a strict OpenAI text format", (name, schema) => {
    const format = zodTextFormat(schema, name);
    expect(format.strict).toBe(true);
    expect(format.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
  });
});

describe("BrandAnalysisSchema", () => {
  it("accepts an analysis with no videos and no conclusions", () => {
    const analysis = {
      schemaVersion: 1,
      generatedAt: "2026-10-10T00:00:00.000Z",
      brand: {
        username: "headandshoulders",
        url: "https://www.instagram.com/headandshoulders/",
        followers: null,
      },
      settings: { brandPostLimit: 100, maxCreators: 25, creatorPostLimit: 50 },
      videos: [],
      conclusions: null,
    };
    expect(BrandAnalysisSchema.parse(analysis)).toEqual(analysis);
  });
});
