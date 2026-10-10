import { MAX_COMMENTS } from "./config";

type ApifyUserRef = { username?: string };

// Subset of apify/instagram-scraper "posts" items that the analysis reads.
export type ApifyPostItem = {
  id?: string;
  type?: string;
  shortCode?: string;
  url?: string;
  inputUrl?: string;
  ownerUsername?: string;
  caption?: string;
  timestamp?: string;
  videoDuration?: number;
  videoPlayCount?: number;
  videoViewCount?: number;
  likesCount?: number;
  commentsCount?: number;
  videoUrl?: string;
  coauthorProducers?: ApifyUserRef[];
  taggedUsers?: ApifyUserRef[];
  sponsors?: ApifyUserRef[] | null;
  latestComments?: {
    id?: string;
    text?: string;
    ownerUsername?: string;
    likesCount?: number;
    timestamp?: string;
  }[];
  error?: string;
  errorDescription?: string;
};

export type ApifyProfileItem = {
  followersCount?: number;
  error?: string;
  errorDescription?: string;
};

export type InstagramComment = {
  id: string;
  text: string;
  ownerUsername: string;
  likesCount: number;
  timestamp: string;
};

export type InstagramVideo = {
  id: string;
  shortCode: string;
  url: string;
  ownerUsername: string;
  // Profile whose feed returned this item (the brand or a creator).
  sourceProfile: string;
  caption: string;
  postedAt: string;
  durationSeconds: number | null;
  views: number;
  likes: number | null;
  comments: number;
  videoUrl: string | null;
  coauthors: string[];
  taggedUsers: string[];
  sponsors: string[];
  latestComments: InstagramComment[];
};

const USERNAME_PATTERN = /^[a-z0-9._]{1,30}$/;
// First path segments of instagram.com URLs that are not profiles.
const RESERVED_PATHS = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
  "about",
  "legal",
  "developer",
]);

// Accepts "name", "@name", or a profile URL.
export function parseInstagramUsername(input: string): string | null {
  const trimmed = input.trim().replace(/^@/, "");
  const match = trimmed.match(/instagram\.com\/([^/?#]+)/i);
  if (!match && /instagram\.com/i.test(trimmed)) return null;
  const username = (match ? match[1] : trimmed).toLowerCase();
  if (!USERNAME_PATTERN.test(username) || RESERVED_PATHS.has(username))
    return null;
  // Instagram usernames never start or end with a period or repeat one.
  return /^\.|\.$|\.\./.test(username) ? null : username;
}

export const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

const usernames = (refs: ApifyUserRef[] | null | undefined) =>
  (Array.isArray(refs) ? refs : [])
    .map((ref) => ref.username?.toLowerCase())
    .filter(isPresent);

export function normalizeVideo(item: ApifyPostItem): InstagramVideo | null {
  if (item.error || item.type !== "Video" || !item.shortCode) return null;
  const ownerUsername = (item.ownerUsername ?? "").toLowerCase();
  return {
    id: item.id ?? item.shortCode,
    shortCode: item.shortCode,
    url: item.url ?? `https://www.instagram.com/p/${item.shortCode}/`,
    ownerUsername,
    sourceProfile: parseInstagramUsername(item.inputUrl ?? "") ?? ownerUsername,
    caption: item.caption ?? "",
    postedAt: item.timestamp ?? "",
    durationSeconds: item.videoDuration ?? null,
    views: item.videoPlayCount ?? item.videoViewCount ?? 0,
    // Instagram reports -1 when the owner hides like counts.
    likes:
      item.likesCount === undefined || item.likesCount < 0
        ? null
        : item.likesCount,
    comments: Math.max(0, item.commentsCount ?? 0),
    videoUrl: item.videoUrl ?? null,
    coauthors: usernames(item.coauthorProducers),
    taggedUsers: usernames(item.taggedUsers),
    sponsors: usernames(item.sponsors),
    latestComments: (item.latestComments ?? [])
      .filter((comment) => comment.text)
      .slice(0, MAX_COMMENTS)
      .map((comment) => ({
        id: comment.id ?? "",
        text: comment.text ?? "",
        ownerUsername: comment.ownerUsername ?? "",
        likesCount: comment.likesCount ?? 0,
        timestamp: comment.timestamp ?? "",
      })),
  };
}
