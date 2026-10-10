import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/headandshoulders-videos.json";
import {
  normalizeVideo,
  parseInstagramUsername,
  type ApifyPostItem,
} from "./instagram";

const items = fixture as unknown as ApifyPostItem[];

describe("parseInstagramUsername", () => {
  it.each([
    ["https://www.instagram.com/headandshoulders", "headandshoulders"],
    ["https://www.instagram.com/HeadAndShoulders/?hl=en", "headandshoulders"],
    ["@headandshoulders", "headandshoulders"],
    ["  b.miller.78 ", "b.miller.78"],
  ])("parses %s", (input, expected) => {
    expect(parseInstagramUsername(input)).toBe(expected);
  });

  it.each([
    "",
    "https://example.com/x y",
    "name with spaces",
    "a".repeat(31),
    "https://www.instagram.com/reel/C8abcDEF/",
    "https://www.instagram.com/p/DeHlXOFtWfc/",
    "instagram.com/stories/someone/123",
    "instagram.com",
    "..",
    "a..b",
    ".name",
    "name.",
  ])("rejects %s", (input) => {
    expect(parseInstagramUsername(input)).toBeNull();
  });
});

describe("normalizeVideo", () => {
  it("maps a collab reel owned by the creator", () => {
    const video = normalizeVideo(
      items.find((item) => item.shortCode === "DeHlXOFtWfc")!,
    );
    expect(video).toMatchObject({
      shortCode: "DeHlXOFtWfc",
      ownerUsername: "haleighcaruso",
      sourceProfile: "headandshoulders",
      views: 44298,
      likes: 614,
      comments: 40,
      coauthors: ["headandshoulders"],
    });
    expect(video?.latestComments).toHaveLength(15);
    expect(video?.latestComments[0].text).toBeTypeOf("string");
  });

  it("treats hidden likes as null and skips non-video or error items", () => {
    const base = items[0];
    expect(normalizeVideo({ ...base, likesCount: -1 })?.likes).toBeNull();
    expect(normalizeVideo({ ...base, type: "Image" })).toBeNull();
    expect(
      normalizeVideo({
        error: "not_found",
        errorDescription: "Page not found",
      }),
    ).toBeNull();
  });

  it("keeps at most 15 comments per video", () => {
    const base = items.find((item) => item.shortCode === "DeHlXOFtWfc")!;
    const comments = Array.from({ length: 40 }, (_, index) => ({
      id: String(index),
      text: `comment ${index}`,
    }));
    expect(
      normalizeVideo({ ...base, latestComments: comments })?.latestComments,
    ).toHaveLength(15);
  });

  it("normalizes every fixture video", () => {
    expect(items.map(normalizeVideo).filter(Boolean)).toHaveLength(10);
  });
});
