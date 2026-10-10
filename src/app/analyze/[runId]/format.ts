import type { CommentAnalysis, Emotion } from "@/lib/analysis/schema";

export const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const humanize = (value: string) => value.replace(/_/g, " ");

export const formatMultiple = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(2)}×`;

/** Splits "0–3s: Hook shot" or "2.8s: Close-up" into its timestamp and text. */
export function splitTimestamp(line: string): {
  time: string | null;
  text: string;
} {
  const match = line.match(
    /^\s*(\d[\d.:]*\s*(?:[–-]\s*\d[\d.:]*)?\s*s?)\s*[:—]\s*([\s\S]+)$/,
  );
  return match
    ? { time: match[1].replace(/\s+/g, ""), text: match[2].trim() }
    : { time: null, text: line.trim() };
}

/** Position of a page score on a log scale centered at 1×, clamped to -1…1. */
export function scorePosition(score: number, maxDoublings = 4) {
  const position = Math.log2(Math.max(score, 1e-6)) / maxDoublings;
  return Math.max(-1, Math.min(1, position));
}

export function topEmotions(
  emotions: CommentAnalysis["emotions"],
  count: number,
): { emotion: Emotion; share: number }[] {
  return (Object.entries(emotions) as [Emotion, number][])
    .map(([emotion, share]) => ({ emotion, share }))
    .filter(({ share }) => share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, count);
}
