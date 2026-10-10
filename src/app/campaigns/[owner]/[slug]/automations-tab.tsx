import Link from "next/link";
import { TeamMark } from "@/components/campaign-ui";
import {
  formatDate,
  formatDuration,
  formatTime,
} from "@/lib/campaigns/queries";
import { TEAMS } from "@/lib/campaigns/teams";
import type { Campaign, Workflow } from "@/lib/campaigns/types";
import {
  ENGINE_COPY,
  labelClass,
  PanelHeading,
  Pill,
  StatusGlyph,
  textLinkClass,
} from "./parts";

export function AutomationsTab({ campaign }: { campaign: Campaign }) {
  const enabled = campaign.workflows.filter((workflow) => workflow.enabled);
  return (
    <div className="flex flex-col gap-10">
      <PanelHeading
        title="Automations"
        description={`${enabled.length} of ${campaign.workflows.length} on`}
        action={
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/analyze" className={textLinkClass}>
              Analyze →
            </Link>
            <Link href="/generate" className={textLinkClass}>
              Generate →
            </Link>
          </div>
        }
      />
      <div className="flex flex-col gap-6">
        {campaign.workflows.map((workflow) => (
          <WorkflowCard key={workflow.id} workflow={workflow} />
        ))}
      </div>
    </div>
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const engine = ENGINE_COPY[workflow.engine];
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-line">
      <div className="flex flex-col gap-6 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="font-display text-3xl leading-tight sm:text-4xl">
              {workflow.name}
            </h3>
            <p className="font-mono text-xs text-muted">{workflow.trigger}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {engine.href ? (
              <Link href={engine.href}>
                <Pill className="border-dashed transition-colors hover:border-foreground">
                  {engine.label} →
                </Pill>
              </Link>
            ) : (
              <Pill className="border-dashed">{engine.label}</Pill>
            )}
            <Pill solid={workflow.enabled}>
              {workflow.enabled ? "On" : "Off"}
            </Pill>
          </div>
        </div>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {workflow.steps.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="flex items-center gap-2 rounded-full border border-line-strong py-1 pr-3 pl-1 text-xs">
                <span className="grid size-5 place-items-center rounded-full bg-foreground/10 font-mono text-[10px]">
                  {index + 1}
                </span>
                {step}
              </span>
              {index < workflow.steps.length - 1 && (
                <span aria-hidden className="text-subtle">
                  →
                </span>
              )}
            </li>
          ))}
          {workflow.opensPullRequestFor && (
            <li className="flex items-center gap-2">
              <span aria-hidden className="text-subtle">
                →
              </span>
              <span className="flex items-center gap-2 rounded-full border border-dashed border-line-strong py-1 pr-3 pl-1 text-xs">
                <TeamMark
                  id={workflow.opensPullRequestFor}
                  className="size-5 text-[7px]"
                />
                {TEAMS[workflow.opensPullRequestFor].name}
              </span>
            </li>
          )}
        </ol>
      </div>
      <div className="border-t border-line bg-panel">
        <p className={`${labelClass} px-5 pt-4 sm:px-7`}>Recent runs</p>
        {workflow.runs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted sm:px-7">
            No runs yet. Turns on at launch.
          </p>
        ) : (
          <ul className="py-2">
            {workflow.runs.map((run) => (
              <li
                key={run.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-5 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-7"
              >
                <StatusGlyph status={run.status} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm break-words">{run.summary}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {run.trigger}
                    {run.output && (
                      <>
                        {" · "}
                        <Link
                          href={run.output.href}
                          className="text-foreground hover:underline"
                        >
                          {run.output.label} →
                        </Link>
                      </>
                    )}
                  </span>
                </div>
                <span className="col-start-2 font-mono text-[11px] text-muted sm:col-start-auto sm:text-right">
                  {formatDate(run.startedAt)} · {formatTime(run.startedAt)} ·{" "}
                  {run.status === "running"
                    ? "running"
                    : formatDuration(run.durationSeconds)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
