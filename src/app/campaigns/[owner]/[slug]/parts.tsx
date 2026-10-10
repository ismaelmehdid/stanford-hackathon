import Link from "next/link";
import type { ReactNode } from "react";
import { TeamMark } from "@/components/campaign-ui";
import {
  draftTitle,
  formatDate,
  latestRelease,
  updateStatus,
  type UpdateStatus,
} from "@/lib/campaigns/queries";
import { contributorName } from "@/lib/campaigns/teams";
import type {
  Campaign,
  Commit,
  EngineLink,
  PullRequest,
  Workflow,
} from "@/lib/campaigns/types";

export const labelClass =
  "font-mono text-[10px] tracking-[0.2em] text-muted uppercase";

export function Pill({
  children,
  solid = false,
  className = "",
}: {
  children: ReactNode;
  solid?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] whitespace-nowrap uppercase ${solid ? "bg-foreground text-background" : "border border-line-strong"} ${className}`}
    >
      {children}
    </span>
  );
}

/** Pass, fail and wait are told apart by glyph, not color. */
export function StatusGlyph({
  status,
}: {
  status: "passed" | "failed" | "pending" | "success" | "failure" | "running";
}) {
  const passed = status === "passed" || status === "success";
  const failed = status === "failed" || status === "failure";
  return (
    <span
      aria-label={passed ? "Passed" : failed ? "Failed" : "In progress"}
      className={`inline-grid size-5 shrink-0 place-items-center rounded-full font-mono text-[11px] leading-none ${passed ? "bg-foreground text-background" : failed ? "border border-foreground" : "animate-pulse-soft border border-dashed border-foreground/60"}`}
    >
      {passed ? "✓" : failed ? "✕" : "·"}
    </span>
  );
}

export function ApprovalIcon({ status }: { status: PullRequest["status"] }) {
  const style =
    status === "open"
      ? "border-[1.5px] border-foreground"
      : status === "merged"
        ? "bg-foreground"
        : "hatch border border-foreground/50";
  return (
    <span
      aria-label={APPROVAL_STATUS_LABEL[status]}
      className={`mt-1 inline-grid size-4 shrink-0 place-items-center rounded-full ${style}`}
    >
      {status === "open" && (
        <span className="size-1 rounded-full bg-foreground" />
      )}
    </span>
  );
}

export const APPROVAL_STATUS_LABEL: Record<PullRequest["status"], string> = {
  open: "In review",
  merged: "Approved",
  closed: "Declined",
};

const UPDATE_STATUS_LABEL: Record<Exclude<UpdateStatus, "live">, string> = {
  "in-review": "In review",
  declined: "Declined",
  draft: "Draft",
};

export const ENGINE_COPY: Record<
  Workflow["engine"],
  { label: string; href?: string; cta?: string }
> = {
  analysis: {
    label: "Influencer analysis",
    href: "/analyze",
    cta: "Open Analyze",
  },
  generation: {
    label: "Storyboard generation",
    href: "/generate",
    cta: "Open Generate",
  },
  media: { label: "Media data" },
  adaptation: { label: "Format specs" },
  monitoring: { label: "Monitoring" },
};

export function EnginePill({ engine }: { engine: EngineLink }) {
  return (
    <Pill className="border-dashed">
      {engine.kind === "analysis" ? "From analysis" : "From storyboard"}
    </Pill>
  );
}

const CHANGE_LABEL = {
  added: "New",
  modified: "Updated",
  removed: "Removed",
} as const;

export function UpdateRow({
  campaign,
  commit,
}: {
  campaign: Campaign;
  commit: Commit;
}) {
  const status = updateStatus(campaign, commit);
  const live =
    campaign.status !== "wrapped" &&
    latestRelease(campaign)?.tag === commit.tag;
  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 transition-colors hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground sm:gap-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <TeamMark id={commit.author} className="mt-0.5 size-8 text-[10px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="font-medium break-words">{commit.message}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
            <span className="text-foreground/85">
              {contributorName(commit.author)}
            </span>
            <span>{commit.authorName}</span>
            <span aria-hidden>·</span>
            <span>{formatDate(commit.date)}</span>
            {commit.tag && (
              <Pill solid>
                {commit.tag} {live ? "live" : "launched"}
              </Pill>
            )}
            {status !== "live" && (
              <a
                href={`#approvals${status === "in-review" ? "" : "/decided"}`}
                className="transition-colors hover:text-foreground"
              >
                <Pill className={status === "draft" ? "border-dashed" : ""}>
                  {UPDATE_STATUS_LABEL[status]}
                </Pill>
              </a>
            )}
            {commit.engine && <EnginePill engine={commit.engine} />}
          </div>
          {status !== "live" && (
            <p className="text-xs break-words text-muted">
              Part of “{draftTitle(campaign, commit.branch)}”
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <span className="font-mono text-[11px] text-muted">
            {commit.files.length}{" "}
            {commit.files.length === 1 ? "asset" : "assets"}
          </span>
          <span
            aria-hidden
            className="font-mono text-xs text-muted transition-transform group-open:rotate-90"
          >
            ›
          </span>
        </div>
      </summary>
      <div className="flex flex-col gap-5 px-4 pb-5 sm:pr-5 sm:pl-[4.25rem]">
        {commit.body && (
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            {commit.body}
          </p>
        )}
        {commit.impact && (
          <dl className="flex flex-wrap gap-3">
            {commit.impact.map((impact) => (
              <div
                key={impact.metric}
                className="flex flex-col gap-1 rounded-2xl border border-line-strong px-4 py-3"
              >
                <dt className={labelClass}>{impact.metric}</dt>
                <dd className="font-mono text-sm tabular-nums">
                  <span className="text-muted">{impact.before}</span> →{" "}
                  {impact.after}{" "}
                  <span className="text-muted">
                    {impact.good ? "▲ better" : "▼ worse"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        <ul className="flex flex-col overflow-hidden rounded-2xl border border-line">
          {commit.files.map((file) => (
            <li
              key={file.path}
              className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-xs last:border-b-0"
            >
              <span className="w-16 shrink-0 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
                {CHANGE_LABEL[file.change]}
              </span>
              <span className="min-w-0 flex-1 break-all">
                {file.path.split("/").at(-1)}
              </span>
            </li>
          ))}
        </ul>
        {commit.engine && (
          <Link
            href={commit.engine.href}
            className="inline-flex w-fit items-center gap-2 font-mono text-[11px] tracking-[0.2em] uppercase hover:underline"
          >
            {commit.engine.label} ·{" "}
            {commit.engine.kind === "analysis"
              ? "Open Analyze"
              : "Open Generate"}{" "}
            →
          </Link>
        )}
      </div>
    </details>
  );
}

export function PanelHeading({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-3xl leading-none tracking-tight sm:text-4xl">
          {title}
        </h2>
        {description && (
          <p className="max-w-xl text-sm text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export const textLinkClass =
  "font-mono text-[11px] tracking-[0.2em] whitespace-nowrap text-muted uppercase transition-colors hover:text-foreground";
