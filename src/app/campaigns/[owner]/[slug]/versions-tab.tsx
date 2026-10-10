import { TeamMark } from "@/components/campaign-ui";
import {
  formatDate,
  latestRelease,
  releaseContributors,
} from "@/lib/campaigns/queries";
import { contributorName, contributorShortName } from "@/lib/campaigns/teams";
import type { Campaign } from "@/lib/campaigns/types";
import { labelClass, PanelHeading, Pill } from "./parts";

export function VersionsTab({ campaign }: { campaign: Campaign }) {
  const latest = latestRelease(campaign);
  const releases = [...campaign.releases].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  return (
    <div className="flex flex-col gap-10">
      <PanelHeading title="Versions" />
      {releases.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line-strong px-6 py-12 text-center text-muted">
          No version live yet. Version 1.0 goes live when the brand manager
          approves the launch package.
        </p>
      ) : (
        <ol className="flex flex-col">
          {releases.map((release, index) => {
            const contributors = releaseContributors(campaign, release);
            return (
              <li
                key={release.tag}
                className="grid grid-cols-1 gap-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-8"
              >
                <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:pt-6">
                  <span className="font-mono text-sm">{release.tag}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {formatDate(release.date, "long")}
                  </span>
                </div>
                <article
                  className={`relative flex flex-col gap-6 border-line pb-10 sm:border-l sm:pl-8 ${index === releases.length - 1 ? "sm:pb-0" : ""}`}
                >
                  <span
                    aria-hidden
                    className={`absolute top-7 -left-[5px] hidden size-[9px] rounded-full sm:block ${release === latest ? "bg-foreground" : "border border-foreground/60 bg-background"}`}
                  />
                  <div
                    className={`flex flex-col gap-6 rounded-3xl p-5 sm:p-7 ${release === latest ? "bg-foreground text-background" : "border border-line"}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill
                        className={
                          release === latest
                            ? "border-background/40"
                            : undefined
                        }
                      >
                        {release.tag}
                      </Pill>
                      {release === latest && (
                        <span className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-60">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="font-display text-4xl leading-tight">
                        {release.name}
                      </h3>
                      <p className="text-sm opacity-60">
                        Launched by {contributorName(release.author)}
                      </p>
                    </div>
                    <ul className="flex flex-col gap-2 text-sm">
                      {release.notes.map((note) => (
                        <li key={note} className="flex gap-3">
                          <span aria-hidden className="opacity-40">
                            —
                          </span>
                          {note}
                        </li>
                      ))}
                    </ul>
                    <dl className="grid grid-cols-3 gap-4">
                      {release.metrics.map((metric) => (
                        <div
                          key={metric.label}
                          className="flex min-w-0 flex-col gap-1 border-t border-current/20 pt-3"
                        >
                          <dt className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-60">
                            {metric.label}
                          </dt>
                          <dd className="font-mono text-xl tabular-nums">
                            {metric.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="flex flex-col gap-2.5">
                      <span
                        className={
                          release === latest
                            ? "font-mono text-[10px] tracking-[0.2em] uppercase opacity-60"
                            : labelClass
                        }
                      >
                        {contributors.length} teams
                      </span>
                      <span className="flex flex-wrap gap-x-3 gap-y-2">
                        {contributors.map((id) => (
                          <span
                            key={id}
                            className="flex items-center gap-1.5 text-xs"
                          >
                            <TeamMark
                              id={id}
                              inverted={release === latest}
                              className="size-5 text-[7px]"
                            />
                            {contributorShortName(id)}
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
