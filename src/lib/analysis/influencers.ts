import type { InstagramVideo } from "./instagram";

export type CreatorMatch = { creator: string; source: "collab" | "credited" };

// "🎥 @name", "🎥: @name", "via @name", "shot by: @name", "credit: @name", "cc @name"
const CAPTION_CREDIT =
  /(?:🎥|📹|📸|\bvia\b|\bby\b|\bcredits?\b|\bcc\b)\s*[:-]?\s*@([a-z0-9._]{1,30})/gi;

export function captionCredit(caption: string, brand: string): string | null {
  for (const match of caption.matchAll(CAPTION_CREDIT)) {
    // Instagram usernames never end with a period; a trailing one is punctuation.
    const username = match[1].toLowerCase().replace(/\.+$/, "");
    if (username && username !== brand) return username;
  }
  return null;
}

export function detectCreator(
  video: InstagramVideo,
  brand: string,
): CreatorMatch | null {
  const isCreator = (username: string) => username !== "" && username !== brand;
  // Collab posts appear on the brand page with the creator as owner.
  if (isCreator(video.ownerUsername))
    return { creator: video.ownerUsername, source: "collab" };
  const coauthor = video.coauthors.find(isCreator);
  if (coauthor) return { creator: coauthor, source: "collab" };
  const credited =
    video.taggedUsers.find(isCreator) ??
    video.sponsors.find(isCreator) ??
    captionCredit(video.caption, brand);
  return credited ? { creator: credited, source: "credited" } : null;
}

// Creators with the most brand videos first, then the most recent.
export function rankCreators(
  entries: { creator: string; postedAt: string }[],
  max: number,
): string[] {
  const stats = new Map<string, { count: number; latest: string }>();
  for (const { creator, postedAt } of entries) {
    const current = stats.get(creator) ?? { count: 0, latest: "" };
    stats.set(creator, {
      count: current.count + 1,
      latest: postedAt > current.latest ? postedAt : current.latest,
    });
  }
  return [...stats.entries()]
    .sort(
      ([, a], [, b]) => b.count - a.count || b.latest.localeCompare(a.latest),
    )
    .slice(0, max)
    .map(([creator]) => creator);
}
