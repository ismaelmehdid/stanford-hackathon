import { AUTOMATION, TEAMS } from "@/lib/campaigns/teams";
import type { CampaignStatus, ContributorId } from "@/lib/campaigns/types";

/**
 * Team avatars are told apart without color: in-house teams are solid, agencies
 * are outlined, and GrowthOS Automations is a dashed square.
 */
export function TeamMark({
  id,
  inverted = false,
  className = "size-7 text-[10px]",
}: {
  id: ContributorId;
  /** For use on a white background. */
  inverted?: boolean;
  className?: string;
}) {
  const automated = id === "automation";
  const style = automated
    ? `rounded-md border border-dashed ${inverted ? "border-background/70" : "border-foreground/70"}`
    : TEAMS[id].kind === "in-house"
      ? inverted
        ? "rounded-full bg-background text-foreground"
        : "rounded-full bg-foreground text-background"
      : `rounded-full border ${inverted ? "border-background/60" : "border-foreground/60"}`;
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center font-mono leading-none font-medium tracking-wider ${style} ${className}`}
    >
      {automated ? AUTOMATION.monogram : TEAMS[id].monogram}
    </span>
  );
}

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  live: "Live",
  planning: "Planning",
  wrapped: "Wrapped",
};

const STATUS_DOT: Record<CampaignStatus, string> = {
  live: "bg-foreground animate-pulse-soft",
  planning: "border border-foreground",
  wrapped: "border border-foreground/40",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line-strong px-2.5 py-1 font-mono text-[10px] tracking-[0.2em] uppercase">
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  );
}

/** Marks pages that show sample data rather than a connected workspace. */
export function SampleDataBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-1 font-mono text-[10px] tracking-[0.2em] text-muted uppercase ${className}`}
    >
      Sample data
    </span>
  );
}
