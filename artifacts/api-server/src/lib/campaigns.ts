import { db, campaignVersionsTable, campaignActivityTable, type CampaignRow } from "@workspace/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function campaignJson(campaign: CampaignRow) {
  return {
    ...campaign,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

export async function recordVersion(tx: Transaction, campaign: CampaignRow, summary: string) {
  await tx.insert(campaignVersionsTable).values({
    campaignId: campaign.id,
    version: campaign.revision,
    snapshot: campaignJson(campaign),
    summary,
  });
  await tx.insert(campaignActivityTable).values({
    campaignId: campaign.id,
    campaignName: campaign.name,
    actor: "Marketing team",
    action: summary,
  });
}
