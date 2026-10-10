import { TeamMark } from "@/components/campaign-ui";
import { formatDate, teamSummaries } from "@/lib/campaigns/queries";
import { AUTOMATION, TEAMS } from "@/lib/campaigns/teams";
import type { Campaign } from "@/lib/campaigns/types";
import { labelClass, PanelHeading, textLinkClass } from "./parts";

export function TeamsTab({ campaign }: { campaign: Campaign }) {
  return (
    <div className="flex flex-col gap-10">
      <PanelHeading
        title="Teams"
        description="Solid: in-house. Outlined: agency. Dashed: automation."
      />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {teamSummaries(campaign).map((summary) => {
          const automated = summary.id === "automation";
          const role = summary.id === "automation" ? null : TEAMS[summary.id];
          const stats: [string, number][] = [
            ["Updates", summary.commits.length],
            automated
              ? [
                  "Automations on",
                  campaign.workflows.filter(({ enabled }) => enabled).length,
                ]
              : ["In review", summary.openPullRequests],
            ["Reviews given", summary.reviews],
          ];
          return (
            <li
              key={summary.id}
              className="flex flex-col gap-6 rounded-3xl border border-line p-5 sm:p-7"
            >
              <div className="flex items-start gap-4">
                <TeamMark id={summary.id} className="size-12 text-xs" />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass}>
                    {automated ? "Automation" : role?.kind}
                  </span>
                  <h3 className="font-display text-3xl leading-tight">
                    {automated ? AUTOMATION.name : role?.name}
                  </h3>
                  <p className="text-sm">
                    {summary.contributor
                      ? `${summary.contributor.org} · ${summary.contributor.lead}`
                      : "GrowthOS"}
                    {summary.contributor && (
                      <span className="text-muted">
                        {" "}
                        · since {formatDate(summary.contributor.since)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-4">
                {stats.map(([name, value]) => (
                  <div
                    key={name}
                    className="flex flex-col gap-1 border-t border-line-strong pt-3"
                  >
                    <dt className={labelClass}>{name}</dt>
                    <dd className="font-mono text-xl tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-col gap-3">
                <span className={labelClass}>Recent work</span>
                {summary.commits.length === 0 ? (
                  <p className="text-sm text-muted">No updates yet.</p>
                ) : (
                  <ul className="flex flex-col">
                    {summary.commits.slice(0, 3).map((commit) => (
                      <li
                        key={commit.sha}
                        className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-sm last:border-b-0"
                      >
                        <span className="min-w-0 break-words">
                          {commit.message}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted">
                          {formatDate(commit.date)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {summary.commits.length > 0 && (
                <a
                  href={`#history/${summary.id}`}
                  className={`${textLinkClass} mt-auto`}
                >
                  All {summary.commits.length} in history →
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
