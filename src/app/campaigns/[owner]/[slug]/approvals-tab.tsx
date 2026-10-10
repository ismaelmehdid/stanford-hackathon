import Link from "next/link";
import { TeamMark } from "@/components/campaign-ui";
import { byDateDesc, formatDate } from "@/lib/campaigns/queries";
import { contributorName, TEAMS } from "@/lib/campaigns/teams";
import type { Campaign, PullRequest, Review } from "@/lib/campaigns/types";
import {
  APPROVAL_STATUS_LABEL,
  ApprovalIcon,
  labelClass,
  PanelHeading,
  Pill,
  StatusGlyph,
} from "./parts";

const REVIEW_LABEL: Record<Review["state"], string> = {
  approved: "Approved",
  changes_requested: "Asked for changes",
  commented: "Commented",
};

// The benchmark check is the influencer analysis scoring a draft.
const BENCHMARK_CHECK = "Influencer benchmark";

export function ApprovalsTab({
  campaign,
  state,
}: {
  campaign: Campaign;
  state: "in-review" | "decided";
}) {
  const sorted = [...campaign.pullRequests].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const inReview = sorted.filter(({ status }) => status === "open");
  const decided = sorted.filter(({ status }) => status !== "open");
  const shown = state === "in-review" ? inReview : decided;

  const toggleClass = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${active ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`;

  return (
    <div className="flex flex-col gap-10">
      <PanelHeading
        title="Approvals"
        action={
          <div className="flex w-fit gap-1 rounded-full border border-line-strong p-1">
            <a href="#approvals" className={toggleClass(state === "in-review")}>
              In review
              <span className="font-mono text-[11px] opacity-60">
                {inReview.length}
              </span>
            </a>
            <a
              href="#approvals/decided"
              className={toggleClass(state === "decided")}
            >
              Decided
              <span className="font-mono text-[11px] opacity-60">
                {decided.length}
              </span>
            </a>
          </div>
        }
      />
      {shown.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line-strong px-6 py-12 text-center text-muted">
          {state === "in-review"
            ? "Nothing waiting for approval."
            : "No decisions yet."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-line">
          {shown.map((pullRequest) => (
            <ApprovalRow key={pullRequest.number} pullRequest={pullRequest} />
          ))}
        </div>
      )}
    </div>
  );
}

function checkSummary(pullRequest: PullRequest): {
  status: "passed" | "failed" | "pending";
  text: string;
} {
  const failed = pullRequest.checks.filter(({ status }) => status === "failed");
  const pending = pullRequest.checks.filter(
    ({ status }) => status === "pending",
  );
  if (failed.length)
    return {
      status: "failed",
      text: `${failed.length} ${failed.length === 1 ? "check" : "checks"} failed`,
    };
  if (pending.length)
    return {
      status: "pending",
      text: `${pending.length} ${pending.length === 1 ? "check" : "checks"} waiting`,
    };
  return {
    status: "passed",
    text: "All checks passed",
  };
}

function ApprovalRow({ pullRequest }: { pullRequest: PullRequest }) {
  const checks = checkSummary(pullRequest);
  const decision =
    pullRequest.status === "open"
      ? null
      : `${APPROVAL_STATUS_LABEL[pullRequest.status]} ${formatDate(pullRequest.updatedAt)}`;
  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 transition-colors hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground sm:gap-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <ApprovalIcon status={pullRequest.status} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="font-medium break-words">{pullRequest.title}</span>
            {pullRequest.labels.map((label) => (
              <Pill key={label}>{label}</Pill>
            ))}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
            <span>
              Sent {formatDate(pullRequest.createdAt)} by{" "}
              <span className="text-foreground/85">
                {contributorName(pullRequest.author)}
              </span>
            </span>
            {decision && (
              <>
                <span aria-hidden>·</span>
                <span>{decision}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <StatusGlyph status={checks.status} />
            {checks.text}
          </span>
          {pullRequest.reviews.length > 0 && (
            <span className="flex -space-x-1.5">
              {pullRequest.reviews.map((review) => (
                <TeamMark
                  key={`${review.reviewer}-${review.date}`}
                  id={review.reviewer}
                  className="size-5 bg-background text-[7px] ring-2 ring-background"
                />
              ))}
            </span>
          )}
        </div>
      </summary>
      <div className="flex flex-col gap-6 px-4 pb-6 sm:pr-5 sm:pl-12">
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          {pullRequest.body}
          <span className="font-mono text-[11px]">
            {" "}
            · {pullRequest.filesChanged}{" "}
            {pullRequest.filesChanged === 1 ? "asset" : "assets"}
          </span>
        </p>

        <section className="flex flex-col gap-3">
          <h4 className={labelClass}>Checks</h4>
          <ul className="flex flex-col overflow-hidden rounded-2xl border border-line">
            {pullRequest.checks.map((check) => (
              <li
                key={check.name}
                className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <StatusGlyph status={check.status} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    {check.name}
                    {check.name === BENCHMARK_CHECK && (
                      <Link
                        href="/analyze"
                        className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase hover:text-foreground"
                      >
                        GrowthOS analysis →
                      </Link>
                    )}
                  </span>
                  <span className="text-xs text-muted">{check.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {pullRequest.reviews.length > 0 && (
          <section className="flex flex-col gap-3">
            <h4 className={labelClass}>Reviews</h4>
            <ol className="flex flex-col gap-3">
              {byDateDesc(pullRequest.reviews).map((review) => (
                <li
                  key={`${review.reviewer}-${review.date}`}
                  className="flex gap-3"
                >
                  <TeamMark
                    id={review.reviewer}
                    className="size-7 text-[9px]"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border border-line px-4 py-3">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span>{TEAMS[review.reviewer].name}</span>
                      <Pill solid={review.state === "approved"}>
                        {REVIEW_LABEL[review.state]}
                      </Pill>
                      <span className="text-muted">
                        {formatDate(review.date)}
                      </span>
                    </p>
                    <p className="text-sm">{review.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {pullRequest.requestedReviewers.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className={labelClass}>Waiting on</span>
            {pullRequest.requestedReviewers.map((reviewer) => (
              <span key={reviewer} className="flex items-center gap-1.5">
                <TeamMark id={reviewer} className="size-5 text-[7px]" />
                {TEAMS[reviewer].name}
              </span>
            ))}
          </p>
        )}
      </div>
    </details>
  );
}
