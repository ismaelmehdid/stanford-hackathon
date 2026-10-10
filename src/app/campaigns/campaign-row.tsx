import Link from "next/link";
import { CampaignStatusBadge, TeamMark } from "@/components/campaign-ui";
import {
  baseCampaign,
  campaignPath,
  formatDate,
  lastActivity,
  latestRelease,
  teamSummaries,
  weeklyCommitCounts,
} from "@/lib/campaigns/queries";
import { AUTOMATION, contributorName } from "@/lib/campaigns/teams";
import type { Campaign } from "@/lib/campaigns/types";

export const ACTIVITY_WEEKS = 12;

export function campaignActivity(campaign: Campaign): number[] {
  return weeklyCommitCounts(
    campaign.commits,
    ACTIVITY_WEEKS,
    lastActivity(campaign),
  );
}

const plural = (count: number, word: string, many = `${word}s`) =>
  count === 1 ? word : many;

function Meta({ value, label }: { value: string | number; label?: string }) {
  return (
    <li>
      <span className="text-foreground">{value}</span>
      {label && ` ${label}`}
    </li>
  );
}

/** "v2.1" reads as "2.1" after the word "Version". */
const versionNumber = (tag: string) => tag.replace(/^v/i, "");

export function CampaignRow({
  campaign,
  activityScale,
}: {
  campaign: Campaign;
  /** The busiest week across every listed campaign, so rows compare fairly. */
  activityScale: number;
}) {
  const release = latestRelease(campaign);
  const base = baseCampaign(campaign);
  const updatedAt = lastActivity(campaign);
  const openPullRequests = campaign.pullRequests.filter(
    (pullRequest) => pullRequest.status === "open",
  ).length;
  const contributors = teamSummaries(campaign).filter(
    (summary) => summary.id === "automation" || summary.contributor,
  );
  const teamCount = contributors.length - 1;

  return (
    <Link
      href={campaignPath(campaign)}
      className="group grid grid-cols-1 gap-x-10 gap-y-6 py-6 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground sm:px-3 sm:hover:bg-foreground/[0.03] lg:grid-cols-[minmax(0,1fr)_auto_1.5rem] lg:items-center"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1 transition-transform group-hover:translate-x-1">
            <p className="font-mono text-[10px] tracking-[0.2em] break-words text-muted uppercase">
              {campaign.brand}
            </p>
            <h3 className="min-w-0 font-display text-3xl leading-tight break-words">
              {campaign.name}
            </h3>
          </div>
          <CampaignStatusBadge status={campaign.status} />
        </div>
        <p className="max-w-2xl text-sm break-words text-muted">
          {campaign.description}
        </p>
        {base && (
          <p className="font-mono text-xs break-words text-subtle">
            ↳ Built on {base.name}
          </p>
        )}
        <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted tabular-nums">
          {!release ? (
            <li>No version live yet</li>
          ) : campaign.status === "wrapped" ? (
            <li>
              Ended on{" "}
              <span className="text-foreground">
                version {versionNumber(release.tag)}
              </span>
            </li>
          ) : (
            <Meta
              value={`Version ${versionNumber(release.tag)}`}
              label="live"
            />
          )}
          <Meta value={campaign.branches.length} label="in progress" />
          <Meta value={openPullRequests} label="waiting for approval" />
          <Meta
            value={campaign.commits.length}
            label={plural(campaign.commits.length, "update")}
          />
          <Meta value={campaign.budget} label="budget" />
          <Meta value={campaign.markets.join(" · ")} />
          <li>
            Updated{" "}
            <time dateTime={updatedAt} className="text-foreground">
              {formatDate(updatedAt)}
            </time>
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
        <div className="flex flex-col gap-2">
          <span className="flex items-center">
            {contributors.map((summary) => (
              <span
                key={summary.id}
                title={
                  summary.contributor
                    ? `${contributorName(summary.id)} · ${summary.contributor.org}`
                    : contributorName(summary.id)
                }
                className={`bg-background ring-2 ring-background ${summary.id === "automation" ? "ml-1 rounded-md" : "-ml-2 rounded-full first:ml-0"}`}
              >
                <TeamMark id={summary.id} />
              </span>
            ))}
          </span>
          <span className="font-mono text-[10px] tracking-[0.2em] text-subtle uppercase">
            {teamCount} {plural(teamCount, "team")} +{" "}
            {AUTOMATION.shortName.toLowerCase()}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Sparkline counts={campaignActivity(campaign)} max={activityScale} />
          <span
            aria-hidden
            className="font-mono text-[10px] tracking-[0.2em] text-subtle uppercase"
          >
            Last {ACTIVITY_WEEKS} weeks
          </span>
        </div>
      </div>

      <span
        aria-hidden
        className="hidden text-muted transition group-hover:translate-x-1 group-hover:text-foreground lg:block"
      >
        →
      </span>
    </Link>
  );
}

function Sparkline({ counts, max }: { counts: number[]; max: number }) {
  return (
    <span
      role="img"
      aria-label={`Updates per week, last ${counts.length} weeks: ${counts.join(", ")}`}
      className="flex h-8 items-end gap-1"
    >
      {counts.map((count, index) => (
        <span
          key={index}
          className={`w-1.5 ${count === 0 ? "h-px bg-foreground/25" : "bg-foreground/80"}`}
          style={
            count === 0
              ? undefined
              : { height: `${Math.max(12, (count / max) * 100)}%` }
          }
        />
      ))}
    </span>
  );
}
