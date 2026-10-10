import Link from "next/link";
import { SampleDataBadge, TeamMark } from "@/components/campaign-ui";
import { StrandsCanvas } from "@/components/three/strands-canvas";
import {
  buttonPrimary,
  buttonSecondary,
  Eyebrow,
  SectionHeader,
} from "@/components/ui";
import {
  byDateDesc,
  campaignPath,
  formatDate,
  getCampaign,
  latestRelease,
} from "@/lib/campaigns/queries";
import { AUTOMATION, contributorShortName, TEAMS } from "@/lib/campaigns/teams";
import { TEAM_IDS } from "@/lib/campaigns/types";

const PILLARS = [
  {
    title: "Version-control",
    body: "Every brief, asset, sign-off and launch in one timeline. See who changed what, when, and what it did to the numbers.",
    features: ["Timeline", "Approvals", "Versions", "Assets"],
  },
  {
    title: "Automate",
    body: "Influencer analysis every week, storyboards from every new brief, and budget that follows the winning creatives.",
    features: [
      "Influencer analysis",
      "Storyboards",
      "Budget moves",
      "Fatigue alerts",
    ],
  },
  {
    title: "Continuously improve",
    body: "Every launch is measured. Every winner becomes the next brief.",
    features: [
      "Insights",
      "Brief",
      "Production",
      "Adaptation",
      "Go live",
      "Results",
    ],
  },
];

const STEPS = [
  {
    title: "Find",
    body: "Every collab and creator video on the brand's Instagram.",
  },
  {
    title: "Score",
    body: "Views, likes and comments against the brand's usual post and the creator's.",
  },
  {
    title: "Explain",
    body: "What the winners do differently: hook, format, product moment, comments.",
  },
  {
    title: "Generate",
    body: "Scripts and storyboards built from the winners.",
  },
];

/** "v2.1" reads as "2.1" after the word "Version". */
const versionNumber = (tag: string) => tag.replace(/^v/i, "");

export default function Home() {
  const campaign = getCampaign("ondine", "bond-repair-fall-26");
  const release = campaign && latestRelease(campaign);
  const waitingForApproval =
    campaign?.pullRequests.filter(
      (pullRequest) => pullRequest.status === "open",
    ).length ?? 0;

  return (
    <main className="flex flex-1 flex-col">
      <section className="relative isolate flex min-h-[calc(100svh-3.5rem)] flex-col justify-end overflow-hidden border-b border-line">
        <StrandsCanvas className="absolute inset-0 -z-10" />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-background via-background/30 to-transparent" />
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pt-32 pb-14 sm:px-6 sm:pb-20">
          <Eyebrow className="animate-rise">
            GrowthOS · GitHub for Marketing
          </Eyebrow>
          <h1 className="max-w-5xl animate-rise font-display text-6xl leading-[0.92] tracking-tight break-words [animation-delay:100ms] sm:text-8xl lg:text-[9.5rem]">
            GitHub for <em>marketing</em>.
          </h1>
          <div className="flex animate-rise flex-col gap-8 [animation-delay:200ms] lg:flex-row lg:items-end lg:justify-between">
            <p className="max-w-xl text-lg text-muted">
              Version-control, automate, and continuously improve every
              campaign, with every team and agency on one timeline.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/campaigns"
                className={`${buttonPrimary} px-7 py-3.5`}
              >
                Explore campaigns →
              </Link>
              <Link
                href="/analyze"
                className={`${buttonSecondary} px-7 py-3.5`}
              >
                Start an analysis
              </Link>
              <Link
                href="/generate"
                className={`${buttonSecondary} px-7 py-3.5`}
              >
                Generate videos
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-24 sm:px-6 sm:py-32">
        <SectionHeader index="01" title="Three pillars" />
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line lg:grid-cols-3">
          {PILLARS.map((pillar, index) => (
            <article
              key={pillar.title}
              className="flex min-w-0 flex-col gap-10 bg-background p-6 sm:p-8"
            >
              <span className="font-mono text-xs text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-3">
                <h3 className="font-display text-4xl break-words sm:text-5xl">
                  {pillar.title}
                </h3>
                <p className="text-muted">{pillar.body}</p>
              </div>
              <ul className="mt-auto flex flex-wrap gap-2">
                {pillar.features.map((feature) => (
                  <li
                    key={feature}
                    className="rounded-full border border-line-strong px-3 py-1 font-mono text-[10px] tracking-[0.14em] uppercase"
                  >
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pb-24 sm:px-6 sm:pb-32">
        <SectionHeader
          index="02"
          title="Every team, one timeline"
          description="Solid: in-house. Outlined: agency. Dashed: automation."
        />
        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {TEAM_IDS.map((id) => (
            <li
              key={id}
              className="flex min-w-0 items-center gap-4 bg-background p-6"
            >
              <TeamMark id={id} className="size-10 text-xs" />
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="font-display text-2xl leading-none break-words">
                  {TEAMS[id].name}
                </h3>
                <span className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
                  {TEAMS[id].kind === "in-house" ? "In-house" : "Agency"}
                </span>
              </div>
            </li>
          ))}
          <li className="flex min-w-0 items-center gap-4 bg-panel p-6">
            <TeamMark id="automation" className="size-10 text-xs" />
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="font-display text-2xl leading-none break-words">
                {AUTOMATION.name}
              </h3>
              <span className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
                Automation
              </span>
            </div>
          </li>
        </ul>
      </section>

      {campaign && (
        <section className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pb-24 sm:px-6 sm:pb-32">
          <SectionHeader
            index="03"
            title={
              <>
                A campaign&apos;s full <em>story</em>
              </>
            }
          />
          <div className="overflow-hidden rounded-3xl border border-line">
            <div className="flex flex-col gap-4 bg-panel px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[11px] tracking-[0.2em] text-muted uppercase">
                    {campaign.brand}
                  </span>
                  <SampleDataBadge />
                </div>
                <Link
                  href={campaignPath(campaign)}
                  className="min-w-0 font-display text-2xl leading-tight break-words hover:underline sm:text-3xl"
                >
                  {campaign.name}
                </Link>
                <p className="text-sm text-muted">{campaign.description}</p>
              </div>
              <Link
                href={campaignPath(campaign)}
                className={`${buttonSecondary} shrink-0 self-start sm:self-auto`}
              >
                Open campaign →
              </Link>
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-5 py-3 font-mono text-[11px] tracking-[0.14em] text-muted uppercase sm:px-6">
              <span>{campaign.commits.length} updates</span>
              <span>{waitingForApproval} waiting for approval</span>
              <span>
                {release
                  ? `Version ${versionNumber(release.tag)} live`
                  : "No version live yet"}
              </span>
            </p>
            <ol>
              {byDateDesc(campaign.commits)
                .slice(0, 6)
                .map((commit) => (
                  <li
                    key={commit.sha}
                    className="flex items-start gap-4 border-t border-line px-5 py-4 sm:px-6"
                  >
                    <TeamMark
                      id={commit.author}
                      className="mt-0.5 size-8 text-[10px]"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium break-words">
                          <span className="min-w-0">{commit.message}</span>
                          {commit.tag && (
                            <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase">
                              {commit.tag}{" "}
                              {commit.tag === release?.tag
                                ? "live"
                                : "launched"}
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-muted">
                          <span className="text-foreground">
                            {contributorShortName(commit.author)}
                          </span>{" "}
                          · {commit.authorName}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 font-mono text-xs text-muted">
                        <time dateTime={commit.date}>
                          {formatDate(commit.date)}
                        </time>
                      </div>
                    </div>
                  </li>
                ))}
            </ol>
          </div>
        </section>
      )}

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pb-24 sm:px-6 sm:pb-32">
        <SectionHeader
          index="04"
          title="Influencer analysis"
          description="Runs every week on every campaign, or on demand. 5–15 minutes per brand."
        />
        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-16 bg-background p-6 sm:p-8"
            >
              <span className="font-mono text-xs text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-3">
                <h3 className="font-display text-5xl">{step.title}</h3>
                <p className="text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:flex-row sm:items-center sm:px-6">
          <p className="font-display text-3xl">
            Make every campaign better than the <em>last</em>.
          </p>
          <Link href="/campaigns" className={`${buttonPrimary} shrink-0`}>
            Explore campaigns →
          </Link>
        </div>
      </footer>
    </main>
  );
}
