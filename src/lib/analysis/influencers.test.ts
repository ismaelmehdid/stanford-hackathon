import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/headandshoulders-videos.json";
import { captionCredit, detectCreator, rankCreators } from "./influencers";
import {
  normalizeVideo,
  type ApifyPostItem,
  type InstagramVideo,
} from "./instagram";

const BRAND = "headandshoulders";
const videos = (fixture as unknown as ApifyPostItem[])
  .map(normalizeVideo)
  .filter((video): video is InstagramVideo => !!video);
const byCode = (shortCode: string) =>
  videos.find((video) => video.shortCode === shortCode)!;

describe("detectCreator", () => {
  it("uses the post owner for collab posts owned by the creator", () => {
    expect(detectCreator(byCode("DeHlXOFtWfc"), BRAND)).toEqual({
      creator: "haleighcaruso",
      source: "collab",
    });
  });

  it("uses a non-brand co-author for brand-owned collab posts", () => {
    const video = {
      ...byCode("DeILdUwPeHh"),
      coauthors: [BRAND, "stylist.jane"],
    };
    expect(detectCreator(video, BRAND)).toEqual({
      creator: "stylist.jane",
      source: "collab",
    });
  });

  it("credits tagged users on brand-owned posts", () => {
    expect(detectCreator(byCode("DeASv9DPqZR"), BRAND)).toEqual({
      creator: "aidanhutch97",
      source: "credited",
    });
  });

  it("credits a caption handle with a credit cue", () => {
    const video = {
      ...byCode("DeILdUwPeHh"),
      caption: "Silk press magic 🎥 @curls.by.mia.",
    };
    expect(detectCreator(video, BRAND)).toEqual({
      creator: "curls.by.mia",
      source: "credited",
    });
  });

  it("finds the influencer videos in the real fixture", () => {
    // 10 videos: 5 collabs, 1 credited by tag, 4 brand-only (one mentions a creator without a credit cue).
    const creators = videos.flatMap(
      (video) => detectCreator(video, BRAND)?.creator ?? [],
    );
    expect(creators).toEqual([
      "haleighcaruso",
      "aidanhutch97",
      "detroitlionsnfl",
      "haleyybaylee",
      "aidanhutch97",
      "b.miller.78",
    ]);
  });
});

describe("captionCredit", () => {
  it("ignores the brand handle and handles without a cue", () => {
    expect(
      captionCredit("Thanks @headandshoulders via @headandshoulders", BRAND),
    ).toBeNull();
    expect(captionCredit("Shoutout @someone", BRAND)).toBeNull();
    expect(captionCredit("video by @someone and credit: @other", BRAND)).toBe(
      "someone",
    );
  });

  it.each([
    "🎥: @alice",
    "📹 - @alice",
    "cc: @alice",
    "Shot by: @alice",
    "Credits: @alice",
  ])("accepts a colon or dash after the cue in %s", (caption) => {
    expect(captionCredit(caption, BRAND)).toBe("alice");
  });
});

describe("rankCreators", () => {
  it("orders by video count, then most recent, and caps the list", () => {
    const ranked = rankCreators(
      [
        { creator: "a", postedAt: "2026-09-01" },
        { creator: "b", postedAt: "2026-09-05" },
        { creator: "a", postedAt: "2026-08-01" },
        { creator: "c", postedAt: "2026-09-09" },
      ],
      2,
    );
    expect(ranked).toEqual(["a", "c"]);
  });
});
