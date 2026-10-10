import type { Metadata } from "next";
import Link from "next/link";
import { SampleDataBadge, TeamMark } from "@/components/campaign-ui";
import { Eyebrow, SectionHeader, buttonSecondary } from "@/components/ui";
import { listCampaigns } from "@/lib/campaigns/queries";
import { AUTOMATION } from "@/lib/campaigns/teams";
import type { Campaign } from "@/lib/campaigns/types";
import { CampaignRow, campaignActivity } from "./campaign-row";

export const metadata: Metadata = { title: "Campaigns" };

const total = (campaigns: Campaign[], count: (campaign: Campaign) => number) =>
  campaigns.reduce((sum, campaign) => sum + count(campaign), 0);

export default function CampaignsPage() {
  const campaigns = listCampaigns();
  const activityScale = Math.max(
    1,
    ...campaigns.flatMap((campaign) => campaignActivity(campaign)),
  );
  const totals: [string, number][] = [
    ["Campaigns", campaigns.length],
    ["Updates", total(campaigns, (campaign) => campaign.commits.length)],
    [
      "Waiting for approval",
      total(
        campaigns,
        (campaign) =>
          campaign.pullRequests.filter(
            (pullRequest) => pullRequest.status === "open",
          ).length,
      ),
    ],
    [
      "Versions launched",
      total(campaigns, (campaign) => campaign.releases.length),
    ],
    [
      "Automations on",
      total(
        campaigns,
        (campaign) =>
          campaign.workflows.filter((workflow) => workflow.enabled).length,
      ),
    ],
  ];

  return (
    <main className="flex flex-1 flex-col">
      <section className="border-b border-line">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex min-w-0 animate-rise flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <Eyebrow>Campaigns</Eyebrow>
              <SampleDataBadge />
            </div>
            <h1 className="font-display text-6xl leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl">
              Every campaign, <em>versioned</em>.
            </h1>
            <p className="max-w-xl text-lg text-muted">
              See what every team did, in order, and what moved the numbers.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            {totals.map(([name, value]) => (
              <div
                key={name}
                className="flex flex-col gap-1.5 border-t border-line-strong pt-3"
              >
                <dt className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
                  {name}
                </dt>
                <dd className="font-mono text-xl whitespace-nowrap tabular-nums sm:text-2xl">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeader
          title="All campaigns"
          description="Most recent activity first."
        />
        <ul className="flex flex-col border-t border-line">
          {campaigns.map((campaign) => (
            <li
              key={`${campaign.owner}/${campaign.slug}`}
              className="border-b border-line"
            >
              <CampaignRow campaign={campaign} activityScale={activityScale} />
            </li>
          ))}
        </ul>

        <div className="mt-8 grid grid-cols-1 gap-6 rounded-2xl border border-line bg-panel p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 gap-4">
            <TeamMark id="automation" className="size-9 text-[11px]" />
            <div className="flex min-w-0 flex-col gap-2">
              <Eyebrow>{AUTOMATION.name}</Eyebrow>
              <p className="max-w-2xl text-muted">
                Run the same tools by hand on any brand.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/analyze" className={buttonSecondary}>
              Run an analysis →
            </Link>
            <Link href="/generate" className={buttonSecondary}>
              Generate storyboards →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
