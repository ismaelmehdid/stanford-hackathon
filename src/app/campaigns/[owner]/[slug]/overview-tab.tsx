import { TeamMark } from "@/components/campaign-ui";
import {
  branchStatus,
  byDateDesc,
  draftTitle,
  formatDate,
  latestCommitByFolder,
  latestLoopEvent,
  latestRelease,
  LOOP_STAGES,
  teamSummaries,
} from "@/lib/campaigns/queries";
import { contributorName, TEAMS } from "@/lib/campaigns/teams";
import type { Campaign } from "@/lib/campaigns/types";
import {
  APPROVAL_STATUS_LABEL,
  labelClass,
  PanelHeading,
  Pill,
  textLinkClass,
  UpdateRow,
} from "./parts";

const FOLDER_LABEL: Record<string, string> = {
  adaptations: "Adaptations",
  brand: "Brand",
  brief: "Briefs",
  creative: "Creative",
  ecommerce: "Ecommerce",
  insights: "Insights",
  media: "Media",
  pr: "PR",
};

export function OverviewTab({ campaign }: { campaign: Campaign }) {
  const recent = byDateDesc(campaign.commits).slice(0, 5);
  return (
    <div className="grid grid-cols-1 gap-14 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="flex min-w-0 flex-col gap-14">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
          {campaign.kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="flex min-w-0 flex-col gap-1.5 border-t border-line-strong pt-3"
            >
              <dt className={labelClass}>{kpi.label}</dt>
              <dd className="font-mono text-2xl whitespace-nowrap tabular-nums">
                {kpi.value}
              </dd>
              <dd className="font-mono text-[11px] text-muted">
                <span className="text-foreground">{kpi.delta}</span> ·{" "}
                {kpi.note}
              </dd>
            </div>
          ))}
        </dl>

        <ImprovementLoop campaign={campaign} />
        <FileBrowser campaign={campaign} />

        <section className="flex flex-col gap-6">
          <PanelHeading
            title="Recent activity"
            action={
              <a href="#history" className={textLinkClass}>
                All {campaign.commits.length} updates →
              </a>
            }
          />
          <div className="overflow-hidden rounded-3xl border border-line">
            {recent.map((commit) => (
              <UpdateRow key={commit.sha} campaign={campaign} commit={commit} />
            ))}
          </div>
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-10">
        <About campaign={campaign} />
        <LatestRelease campaign={campaign} />
        <Drafts campaign={campaign} />
        <Contributors campaign={campaign} />
      </aside>
    </div>
  );
}

function ImprovementLoop({ campaign }: { campaign: Campaign }) {
  return (
    <section className="flex flex-col gap-6">
      <PanelHeading
        title="Test-and-learn loop"
        description="Latest update at each stage."
      />
      <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
        {LOOP_STAGES.map((stage, index) => {
          const event = latestLoopEvent(campaign, stage.id);
          return (
            <li
              key={stage.id}
              className="flex min-w-0 flex-col gap-5 bg-background p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted">
                    {String(index + 1).padStart(2, "0")}
                    {index === LOOP_STAGES.length - 1 && " → 01"}
                  </span>
                  <h3 className="font-display text-3xl">{stage.title}</h3>
                </div>
                <span className="flex -space-x-1.5">
                  {stage.owners.map((owner) => (
                    <TeamMark
                      key={owner}
                      id={owner}
                      className="size-6 bg-background text-[8px] ring-2 ring-background"
                    />
                  ))}
                </span>
              </div>
              {event ? (
                <p className="mt-auto flex flex-col gap-1 border-t border-line pt-3 text-sm">
                  <span className="break-words">{event.message}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {contributorName(event.author)} · {formatDate(event.date)}
                  </span>
                </p>
              ) : (
                <p className="mt-auto border-t border-line pt-3 font-mono text-[11px] text-muted">
                  Not reached yet
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function FileBrowser({ campaign }: { campaign: Campaign }) {
  const folders = latestCommitByFolder(campaign);
  const head = byDateDesc(campaign.commits).find(
    (commit) => commit.branch === campaign.defaultBranch,
  );
  return (
    <section className="flex flex-col gap-6">
      <PanelHeading title="Assets" />
      <div className="overflow-hidden rounded-3xl border border-line">
        {head && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel px-4 py-3 sm:px-5">
            <span className={labelClass}>Latest update</span>
            <TeamMark id={head.author} className="size-6 text-[8px]" />
            <span className="min-w-0 flex-1 truncate text-sm">
              {head.message}
            </span>
            <span className="font-mono text-[11px] text-muted">
              {formatDate(head.date)}
            </span>
          </div>
        )}
        <ul>
          {folders.map(({ folder, commit, fileCount }) => (
            <li
              key={folder}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:px-5"
            >
              <span className="flex items-center gap-2.5 text-sm">
                <span
                  aria-hidden
                  className="h-2.5 w-3.5 rounded-[2px] border border-foreground/60"
                />
                {FOLDER_LABEL[folder] ?? folder}
                <span className="font-mono text-[11px] text-subtle">
                  {fileCount} {fileCount === 1 ? "file" : "files"}
                </span>
              </span>
              <span className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 text-sm text-muted sm:col-span-1 sm:row-start-auto">
                <TeamMark id={commit.author} className="size-5 text-[7px]" />
                <span className="truncate">{commit.message}</span>
              </span>
              <span className="col-start-2 row-start-1 font-mono text-[11px] text-muted sm:col-start-auto sm:row-start-auto">
                {formatDate(commit.date)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-5">
      <h2 className={labelClass}>{title}</h2>
      {children}
    </section>
  );
}

function About({ campaign }: { campaign: Campaign }) {
  const rows: [string, string][] = [
    ["Brand", campaign.brand],
    ["Budget", campaign.budget],
    [
      "Window",
      `${formatDate(campaign.window.start)} – ${formatDate(campaign.window.end, "long")}`,
    ],
    ["Markets", campaign.markets.join(", ")],
  ];
  return (
    <SidebarSection title="About">
      <dl className="flex flex-col gap-2.5 text-sm">
        {rows.map(([name, value]) => (
          <div key={name} className="flex justify-between gap-4">
            <dt className="text-muted">{name}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-1.5">
        {campaign.channels.map((channel) => (
          <Pill key={channel}>{channel}</Pill>
        ))}
      </div>
    </SidebarSection>
  );
}

function LatestRelease({ campaign }: { campaign: Campaign }) {
  const release = latestRelease(campaign);
  return (
    <SidebarSection title={`Versions · ${campaign.releases.length}`}>
      {release ? (
        <a
          href="#versions"
          className="flex flex-col gap-3 rounded-2xl border border-line-strong p-4 transition-colors hover:border-foreground"
        >
          <span className="flex items-center gap-2">
            <Pill solid>{release.tag}</Pill>
            <span className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
              Current
            </span>
          </span>
          <span className="font-display text-2xl leading-tight">
            {release.name}
          </span>
          <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
            {release.metrics.map((metric) => (
              <span key={metric.label}>
                {metric.label}{" "}
                <span className="text-foreground">{metric.value}</span>
              </span>
            ))}
          </span>
          <span className="font-mono text-[11px] text-muted">
            {formatDate(release.date, "long")}
          </span>
        </a>
      ) : (
        <p className="rounded-2xl border border-dashed border-line-strong p-4 text-sm text-muted">
          No version live yet.
        </p>
      )}
    </SidebarSection>
  );
}

function Drafts({ campaign }: { campaign: Campaign }) {
  return (
    <SidebarSection title={`In progress · ${campaign.branches.length}`}>
      {campaign.branches.length === 0 ? (
        <p className="text-sm text-muted">Nothing in progress.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {campaign.branches.map((branch) => {
            const { ahead } = branchStatus(campaign, branch);
            const request = campaign.pullRequests.find(
              ({ number }) => number === branch.pullRequest,
            );
            return (
              <li key={branch.name}>
                <a
                  href={
                    request
                      ? `#approvals${request.status === "open" ? "" : "/decided"}`
                      : `#history`
                  }
                  className="group flex gap-3"
                >
                  <TeamMark
                    id={branch.author}
                    className="mt-0.5 size-6 text-[8px]"
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm break-words group-hover:underline">
                      {draftTitle(campaign, branch.name)}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <Pill className={request ? "" : "border-dashed"}>
                        {request
                          ? APPROVAL_STATUS_LABEL[request.status]
                          : "Draft"}
                      </Pill>
                      {ahead} {ahead === 1 ? "update" : "updates"} ·{" "}
                      {formatDate(branch.updatedAt)}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </SidebarSection>
  );
}

function Contributors({ campaign }: { campaign: Campaign }) {
  return (
    <SidebarSection title="Teams on this campaign">
      <ul className="flex flex-col">
        {teamSummaries(campaign).map((summary) => (
          <li key={summary.id}>
            <a
              href={`#history/${summary.id}`}
              className="group flex items-center gap-3 rounded-xl py-2 transition-colors"
            >
              <TeamMark id={summary.id} className="size-8 text-[10px]" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm group-hover:underline">
                  {summary.id === "automation"
                    ? contributorName(summary.id)
                    : TEAMS[summary.id].name}
                </span>
                <span className="truncate text-xs text-muted">
                  {summary.contributor
                    ? `${summary.contributor.org} · ${summary.contributor.lead}`
                    : "Automations"}
                </span>
              </span>
              <span className="font-mono text-[11px] text-muted tabular-nums">
                {summary.commits.length}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}
