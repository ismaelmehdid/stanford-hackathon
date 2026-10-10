import { describe, expect, it } from "vitest";
import { clampSettings, estimateApifyCostUsd, MAX_SETTINGS } from "./config";

describe("clampSettings", () => {
  it("defaults missing or invalid values to the caps", () => {
    expect(clampSettings({})).toEqual(MAX_SETTINGS);
    expect(clampSettings({ maxCreators: "abc", brandPostLimit: -4 })).toEqual(
      MAX_SETTINGS,
    );
  });

  it("lowers but never raises the caps", () => {
    expect(
      clampSettings({
        brandPostLimit: 500,
        maxCreators: 3,
        creatorPostLimit: 10.7,
      }),
    ).toEqual({
      brandPostLimit: 100,
      maxCreators: 3,
      creatorPostLimit: 10,
    });
  });
});

describe("estimateApifyCostUsd", () => {
  it("prices the details result, the brand feed and every creator feed", () => {
    expect(
      estimateApifyCostUsd({
        brandPostLimit: 100,
        maxCreators: 25,
        creatorPostLimit: 50,
      }),
    ).toBeCloseTo(1351 * 0.0027);
  });
});
