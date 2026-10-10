import type { ReactNode } from "react";
import type { Tier } from "@/lib/analysis/schema";

export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-50";
export const buttonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-sm font-medium transition hover:border-foreground hover:bg-foreground/5";

export const TIER_COPY = {
  amplify: {
    title: "Amplify",
    description: "Beat both the brand page and the creator's own page.",
  },
  observe: {
    title: "Observe",
    description: "Beat one of the two pages.",
  },
  stop: { title: "Stop", description: "Below both pages." },
} as const;

// Tiers are told apart without color: solid white, hatched, and outlined.
export function TierMark({
  tier,
  inverted = false,
  className = "size-2.5",
}: {
  tier: Tier;
  /** For use on a white background. */
  inverted?: boolean;
  className?: string;
}) {
  const style =
    tier === "amplify"
      ? inverted
        ? "bg-background"
        : "bg-foreground"
      : tier === "observe"
        ? "hatch border border-foreground/70"
        : "border border-foreground/50";
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${style} ${className}`}
    />
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  const label =
    tier === "amplify" || tier === "observe" || tier === "stop"
      ? TIER_COPY[tier].title
      : tier === "too_recent"
        ? "Too recent"
        : "Not enough data";
  const style =
    tier === "amplify"
      ? "bg-foreground text-background"
      : tier === "observe"
        ? "border border-line-strong"
        : "border border-line text-muted";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] uppercase ${style}`}
    >
      {tier === "observe" && <TierMark tier="observe" className="size-2" />}
      {label}
    </span>
  );
}

export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-[11px] tracking-[0.25em] text-muted uppercase ${className}`}
    >
      {children}
    </p>
  );
}

export function SectionHeader({
  index,
  title,
  description,
}: {
  index?: string;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
      <div className="flex items-baseline gap-4">
        {index && <span className="font-mono text-xs text-muted">{index}</span>}
        <h2 className="font-display text-4xl leading-none tracking-tight sm:text-5xl">
          {title}
        </h2>
      </div>
      {description && (
        <p className="max-w-md text-sm text-muted sm:text-right">
          {description}
        </p>
      )}
    </div>
  );
}
