import { describe, expect, it } from "vitest";
import { scorePosition, splitTimestamp, topEmotions } from "./format";

describe("splitTimestamp", () => {
  it("splits beat ranges and single timestamps", () => {
    expect(splitTimestamp("0–3s: Retro hotline intro")).toEqual({
      time: "0–3s",
      text: "Retro hotline intro",
    });
    expect(splitTimestamp("2.8s: Creator poses: smiling")).toEqual({
      time: "2.8s",
      text: "Creator poses: smiling",
    });
    expect(splitTimestamp("0:03 - 0:05: Shower proof")).toEqual({
      time: "0:03-0:05",
      text: "Shower proof",
    });
  });

  it("keeps lines without a timestamp whole", () => {
    expect(splitTimestamp("Finished hair reveal")).toEqual({
      time: null,
      text: "Finished hair reveal",
    });
  });
});

describe("scorePosition", () => {
  it("centers 1× and clamps far scores", () => {
    expect(scorePosition(1)).toBe(0);
    expect(scorePosition(4)).toBe(0.5);
    expect(scorePosition(0.25)).toBe(-0.5);
    expect(scorePosition(1000)).toBe(1);
    expect(scorePosition(0)).toBe(-1);
  });
});

describe("topEmotions", () => {
  it("returns the largest non-zero shares first", () => {
    const emotions = {
      admiration: 0.5,
      desire_to_buy: 0.3,
      trust: 0,
      curiosity_question: 0.2,
      relatability: 0,
      excitement: 0,
      humor: 0,
      skepticism: 0,
      disappointment: 0,
      neutral: 0,
    };
    expect(topEmotions(emotions, 2)).toEqual([
      { emotion: "admiration", share: 0.5 },
      { emotion: "desire_to_buy", share: 0.3 },
    ]);
  });
});
