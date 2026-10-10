"use client";

import { useState } from "react";
import { TeamMark } from "@/components/campaign-ui";
import {
  formatDate,
  groupByDay,
  isInDefaultBranch,
  teamSummaries,
} from "@/lib/campaigns/queries";
import { contributorShortName } from "@/lib/campaigns/teams";
import type { Campaign } from "@/lib/campaigns/types";
import { labelClass, PanelHeading, UpdateRow } from "./parts";

const SCOPES = [
  { id: "all", label: "Everything" },
  { id: "live", label: "Live campaign" },
  { id: "drafts", label: "In progress" },
] as const;

type Scope = (typeof SCOPES)[number]["id"];

export function HistoryTab({
  campaign,
  team,
}: {
  campaign: Campaign;
  /** A contributor id from the URL, or null for every team. */
  team: string | null;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const summaries = teamSummaries(campaign);
  const activeTeam = summaries.find(({ id }) => id === team)?.id ?? null;
  const commits = campaign.commits.filter(
    (commit) =>
      (!activeTeam || commit.author === activeTeam) &&
      (scope === "all" ||
        (scope === "live") === isInDefaultBranch(campaign, commit)),
  );
  const days = groupByDay(commits);

  const chipClass = (active: boolean) =>
    `flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors ${active ? "border-foreground bg-foreground text-background" : "border-line-strong hover:border-foreground"}`;

  return (
    <div className="flex flex-col gap-10">
      <PanelHeading title="Timeline" />

      <div className="flex flex-col gap-4">
        <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <a
            href="#history"
            aria-current={!activeTeam ? "true" : undefined}
            className={`${chipClass(!activeTeam)} pl-3`}
          >
            All teams
            <span className="font-mono text-[11px] opacity-60">
              {campaign.commits.length}
            </span>
          </a>
          {summaries.map((summary) => (
            <a
              key={summary.id}
              href={`#history/${summary.id}`}
              aria-current={activeTeam === summary.id ? "true" : undefined}
              className={chipClass(activeTeam === summary.id)}
            >
              <TeamMark
                id={summary.id}
                inverted={activeTeam === summary.id}
                className="size-6 text-[8px]"
              />
              {contributorShortName(summary.id)}
              <span className="font-mono text-[11px] opacity-60">
                {summary.commits.length}
              </span>
            </a>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-3">
            <span className={labelClass}>Show</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as Scope)}
              className="rounded-full border border-line-strong bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground"
            >
              {SCOPES.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span className="font-mono text-[11px] text-muted">
            {commits.length} {commits.length === 1 ? "update" : "updates"}
          </span>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line-strong px-6 py-12 text-center text-muted">
          Nothing here from this team yet.
        </p>
      ) : (
        <ol className="relative flex flex-col gap-8">
          {days.map(({ day, commits: dayCommits }) => (
            <li key={day} className="flex flex-col gap-3">
              <h3 className="flex items-center gap-3 font-mono text-[11px] tracking-[0.2em] text-muted uppercase">
                <span className="size-1.5 rounded-full border border-foreground/60" />
                {formatDate(day, "long")}
              </h3>
              <div className="overflow-hidden rounded-3xl border border-line">
                {dayCommits.map((commit) => (
                  <UpdateRow
                    key={commit.sha}
                    campaign={campaign}
                    commit={commit}
                  />
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
