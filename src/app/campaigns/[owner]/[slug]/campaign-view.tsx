"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { CampaignStatusBadge, SampleDataBadge } from "@/components/campaign-ui";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import {
  baseCampaign,
  campaignPath,
  formatDate,
  latestRelease,
} from "@/lib/campaigns/queries";
import type { Campaign } from "@/lib/campaigns/types";
import { ApprovalsTab } from "./approvals-tab";
import { AutomationsTab } from "./automations-tab";
import { HistoryTab } from "./history-tab";
import { OverviewTab } from "./overview-tab";
import { Pill } from "./parts";
import { TeamsTab } from "./teams-tab";
import { VersionsTab } from "./versions-tab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "Timeline" },
  { id: "approvals", label: "Approvals" },
  { id: "automations", label: "Automations" },
  { id: "versions", label: "Versions" },
  { id: "teams", label: "Teams" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// The open tab and its filter live in the URL hash ("#history/pr"), so every
// view can be linked to and plain anchors can switch tabs.
function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => window.location.hash.slice(1);
const readServerHash = () => "";

function parseHash(hash: string): { tab: TabId; param: string | null } {
  const [tab, param] = decodeURIComponent(hash).split("/");
  const known = TABS.find(({ id }) => id === tab);
  return {
    tab: known?.id ?? "overview",
    param: known ? (param ?? null) : null,
  };
}

export function CampaignView({ campaign }: { campaign: Campaign }) {
  const hash = useSyncExternalStore(subscribeToHash, readHash, readServerHash);
  const { tab, param } = parseHash(hash);
  const tabsRef = useRef<HTMLElement>(null);

  // Bring the tab bar back into view when a link deep in the page switches tabs.
  useEffect(() => {
    const tabs = tabsRef.current;
    if (tabs && tabs.getBoundingClientRect().top < 0)
      tabs.scrollIntoView({ block: "start" });
  }, [hash]);

  const counts: Partial<Record<TabId, number>> = {
    history: campaign.commits.length,
    approvals: campaign.pullRequests.filter(({ status }) => status === "open")
      .length,
    automations: campaign.workflows.length,
    versions: campaign.releases.length,
    teams: campaign.contributors.length,
  };

  return (
    <div className="flex flex-col">
      <CampaignHeader campaign={campaign} />
      <nav
        ref={tabsRef}
        aria-label="Campaign sections"
        className="sticky top-14 z-30 scroll-mt-14 border-b border-line bg-background/80 backdrop-blur-md"
      >
        <div className="mx-auto flex w-full max-w-7xl [scrollbar-width:none] gap-1 overflow-x-auto px-4 sm:px-6">
          {TABS.map(({ id, label }) => {
            const active = id === tab;
            return (
              <a
                key={id}
                href={`#${id}`}
                aria-current={active ? "page" : undefined}
                className={`relative flex shrink-0 items-center gap-2 px-3 py-3.5 text-sm transition-colors ${active ? "text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {label}
                {counts[id] !== undefined && (
                  <span
                    className={`rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums ${active ? "bg-foreground text-background" : "bg-foreground/10"}`}
                  >
                    {counts[id]}
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-px bg-foreground" />
                )}
              </a>
            );
          })}
        </div>
      </nav>
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        {tab === "overview" && <OverviewTab campaign={campaign} />}
        {tab === "history" && <HistoryTab campaign={campaign} team={param} />}
        {tab === "approvals" && (
          <ApprovalsTab
            campaign={campaign}
            state={param === "decided" ? "decided" : "in-review"}
          />
        )}
        {tab === "automations" && <AutomationsTab campaign={campaign} />}
        {tab === "versions" && <VersionsTab campaign={campaign} />}
        {tab === "teams" && <TeamsTab campaign={campaign} />}
      </div>
    </div>
  );
}

function CampaignHeader({ campaign }: { campaign: Campaign }) {
  const release = latestRelease(campaign);
  const base = baseCampaign(campaign);
  const drafts = campaign.branches.length;
  const meta = [
    `${campaign.commits.length} updates`,
    `${drafts} in progress`,
    `${formatDate(campaign.window.start)} – ${formatDate(campaign.window.end, "long")}`,
    campaign.budget,
    campaign.markets.join(" · "),
  ];
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pt-10 pb-10 sm:px-6 sm:pt-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/campaigns"
            className="font-mono text-[11px] tracking-[0.25em] text-muted uppercase hover:text-foreground"
          >
            ← All campaigns
          </Link>
          <div className="flex flex-wrap gap-2">
            <SampleDataBadge />
            <CampaignStatusBadge status={campaign.status} />
          </div>
        </div>

        <div className="flex animate-rise flex-col gap-4">
          <p className="font-mono text-[11px] tracking-[0.25em] text-muted uppercase">
            {campaign.brand}
          </p>
          <h1 className="font-display text-5xl leading-[0.95] tracking-tight break-words sm:text-6xl lg:text-7xl">
            {campaign.name}
          </h1>
          <p className="max-w-2xl text-lg text-muted">{campaign.description}</p>
          {base && (
            <p className="font-mono text-xs text-muted">
              Built on{" "}
              <Link
                href={campaignPath(base)}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {base.name}
              </Link>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 font-mono text-xs text-muted">
          {release ? (
            <Pill solid>
              {campaign.status === "wrapped"
                ? `Ended on version ${release.tag.slice(1)}`
                : `Version ${release.tag.slice(1)} live`}
            </Pill>
          ) : (
            <Pill>No version live yet</Pill>
          )}
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/analyze" className={buttonPrimary}>
            Run influencer analysis →
          </Link>
          <Link href="/generate" className={buttonSecondary}>
            Generate storyboards
          </Link>
        </div>
      </div>
    </header>
  );
}

export function CampaignViewSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-24 sm:px-6">
      <span className="h-3 w-40 animate-pulse rounded-full bg-foreground/10" />
      <span className="h-16 w-full max-w-2xl animate-pulse rounded-2xl bg-foreground/10" />
      <span className="h-4 w-80 animate-pulse rounded-full bg-foreground/10" />
    </div>
  );
}
