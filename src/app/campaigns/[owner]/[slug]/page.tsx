import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CAMPAIGNS } from "@/lib/campaigns/data";
import { getCampaign } from "@/lib/campaigns/queries";
import { CampaignView, CampaignViewSkeleton } from "./campaign-view";

export function generateStaticParams() {
  return CAMPAIGNS.map(({ owner, slug }) => ({ owner, slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/campaigns/[owner]/[slug]">): Promise<Metadata> {
  const { owner, slug } = await params;
  const campaign = getCampaign(owner, slug);
  return campaign
    ? { title: campaign.name, description: campaign.description }
    : { title: "Campaign not found" };
}

async function CampaignLoader({
  params,
}: {
  params: Promise<{ owner: string; slug: string }>;
}) {
  const { owner, slug } = await params;
  const campaign = getCampaign(owner, slug);
  if (!campaign) notFound();
  return <CampaignView campaign={campaign} />;
}

export default function CampaignPage({
  params,
}: PageProps<"/campaigns/[owner]/[slug]">) {
  return (
    <main className="flex w-full flex-1 flex-col">
      <Suspense fallback={<CampaignViewSkeleton />}>
        <CampaignLoader params={params} />
      </Suspense>
    </main>
  );
}
