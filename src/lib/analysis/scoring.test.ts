import { describe, expect, it } from "vitest";
import type { InstagramVideo } from "./instagram";
import { comparePage, median, scoreVideos, tierFor } from "./scoring";

const NOW = new Date("2026-10-10T00:00:00Z");

function video(
  shortCode: string,
  views: number,
  likes: number | null,
  comments: number,
  postedAt = "2026-09-01T00:00:00Z",
): InstagramVideo {
  return {
    id: shortCode,
    shortCode,
    url: "",
    ownerUsername: "",
    sourceProfile: "",
    caption: "",
    postedAt,
    durationSeconds: 10,
    views,
    likes,
    comments,
    videoUrl: null,
    coauthors: [],
    taggedUsers: [],
    sponsors: [],
    latestComments: [],
  };
}

const page = (
  prefix: string,
  count: number,
  views: number,
  likes: number | null,
  comments: number,
) =>
  Array.from({ length: count }, (_, index) =>
    video(`${prefix}${index}`, views, likes, comments),
  );

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("comparePage", () => {
  it("scores the geometric mean of (value + 1) / (median + 1) and excludes the video itself", () => {
    const target = video("t", 1999, 199, 19);
    const result = comparePage(target, [target, ...page("p", 5, 999, 99, 9)]);
    expect(result?.ratios).toEqual({ views: 2, likes: 2, comments: 2 });
    expect(result?.score).toBeCloseTo(2);
  });

  it("returns null when the page has fewer than 5 other videos", () => {
    expect(comparePage(video("t", 10, 1, 1), page("p", 4, 1, 1, 1))).toBeNull();
  });

  it("drops hidden likes and stays finite on all-zero baselines", () => {
    const result = comparePage(video("t", 0, null, 0), page("p", 5, 0, 0, 0));
    expect(result?.ratios.likes).toBeNull();
    expect(result?.score).toBe(1);
    expect(Number.isFinite(result?.score)).toBe(true);
  });
});

describe("tierFor", () => {
  const win = { score: 1.5, ratios: { views: 1.5, likes: 1.5, comments: 1.5 } };
  const loss = {
    score: 0.5,
    ratios: { views: 0.5, likes: 0.5, comments: 0.5 },
  };
  const old = video("t", 1, 1, 1);

  it("assigns amplify, observe and stop", () => {
    expect(tierFor(old, win, win, NOW)).toBe("amplify");
    expect(tierFor(old, win, loss, NOW)).toBe("observe");
    expect(tierFor(old, loss, win, NOW)).toBe("observe");
    expect(tierFor(old, loss, loss, NOW)).toBe("stop");
  });

  it("flags recent videos and missing baselines", () => {
    expect(
      tierFor(video("t", 1, 1, 1, "2026-10-08T12:00:00Z"), win, win, NOW),
    ).toBe("too_recent");
    expect(tierFor(old, null, win, NOW)).toBe("insufficient_data");
  });
});

describe("scoreVideos", () => {
  it("ranks each tier by the weaker of the two page scores", () => {
    const strong = video("strong", 5000, 500, 50);
    const lopsided = video("lopsided", 50000, 5000, 500);
    const brandVideos = [strong, lopsided, ...page("b", 5, 100, 10, 1)];
    const creatorVideos = new Map([
      ["alice", [strong, ...page("a", 5, 100, 10, 1)]],
      ["bob", [lopsided, ...page("c", 5, 40000, 4000, 400)]],
    ]);
    const scored = scoreVideos({
      influencerVideos: [
        { video: lopsided, match: { creator: "bob", source: "collab" } },
        { video: strong, match: { creator: "alice", source: "collab" } },
      ],
      brandVideos,
      creatorVideos,
      now: NOW,
    });
    const byCode = Object.fromEntries(
      scored.map((item) => [item.video.shortCode, item]),
    );
    expect(byCode.strong).toMatchObject({ tier: "amplify", rank: 1 });
    expect(byCode.lopsided).toMatchObject({ tier: "amplify", rank: 2 });
  });
});
