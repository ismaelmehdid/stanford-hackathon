import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, campaignsTable, campaignActivityTable, budgetPlansTable } from "@workspace/db";
import {
  GetGrowthAnalyticsQueryParams, GetGrowthAnalyticsResponse,
  CreateBudgetPlanBody, CreateBudgetPlanResponse, GetBudgetPlansResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const channels = ["Paid", "Content", "Social", "Email", "SEO", "Brand"];
const stages = ["idea", "draft", "in_review", "approved", "live"];

router.get("/analytics", async (req, res): Promise<void> => {
  const parsed = GetGrowthAnalyticsQueryParams.safeParse({
    ...req.query,
    ...(req.query.days !== undefined && { days: typeof req.query.days === "string" ? Number(req.query.days) : NaN }),
  });
  if (!parsed.success) { res.status(400).json({ error: "Choose 7, 30, or 90 days and a valid channel." }); return; }
  const days = parsed.data.days ?? 30;
  const channel = parsed.data.channel;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1));
  const scoped = channel ? eq(campaignsTable.channel, channel) : undefined;
  // Only current planning aggregates; campaign content never leaves the server here.
  const [grouped, activity] = await Promise.all([
    db.select({
      channel: campaignsTable.channel, stage: campaignsTable.status,
      campaigns: sql<number>`count(*)::int`,
      plannedBudget: sql<number>`coalesce(sum(${campaignsTable.budget}), 0)::float8`,
    }).from(campaignsTable).where(scoped).groupBy(campaignsTable.channel, campaignsTable.status),
    db.select({
      date: sql<string>`to_char(${campaignActivityTable.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      actions: sql<number>`count(*)::int`,
    }).from(campaignActivityTable)
      .innerJoin(campaignsTable, eq(campaignsTable.id, campaignActivityTable.campaignId))
      .where(and(scoped, gte(campaignActivityTable.createdAt, start)))
      .groupBy(sql`to_char(${campaignActivityTable.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`),
  ]);
  const [unfunded] = await db.select({ count: sql<number>`count(*)::int` }).from(campaignsTable)
    .where(and(scoped, eq(campaignsTable.budget, 0)));
  const totalBudget = grouped.reduce((sum, row) => sum + row.plannedBudget, 0);
  const byChannel = (channel ? [channel] : channels).map(name => {
    const rows = grouped.filter(row => row.channel === name);
    const plannedBudget = rows.reduce((sum, row) => sum + row.plannedBudget, 0);
    return { channel: name, campaigns: rows.reduce((sum, row) => sum + row.campaigns, 0), plannedBudget, share: totalBudget ? plannedBudget / totalBudget : 0 };
  });
  const byStage = stages.map(stage => {
    const rows = grouped.filter(row => row.stage === stage);
    return { stage, campaigns: rows.reduce((sum, row) => sum + row.campaigns, 0), plannedBudget: rows.reduce((sum, row) => sum + row.plannedBudget, 0) };
  });
  const trend = Array.from({ length: days }, (_, index) => {
    const date = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
    return { date, actions: activity.find(row => row.date === date)?.actions ?? 0 };
  });
  res.json(GetGrowthAnalyticsResponse.parse({
    generatedAt: now.toISOString(), periodDays: days, currency: "USD",
    sourceStatus: "not_connected",
    sourceMessage: "Meta Ads is not connected. Actual spend, conversions, CPA, and ROAS are unavailable. Planning figures come from saved campaign budgets (including example repositories), not ad performance.",
    totalCampaigns: grouped.reduce((sum, row) => sum + row.campaigns, 0),
    plannedBudget: totalBudget,
    reviewBudget: byStage.find(row => row.stage === "in_review")!.plannedBudget,
    approvedBudget: byStage.find(row => row.stage === "approved")!.plannedBudget,
    liveBudget: byStage.find(row => row.stage === "live")!.plannedBudget,
    unfundedCampaigns: unfunded?.count ?? 0, byChannel, byStage, trend,
    actualSpend: null, conversions: null, costPerAcquisition: null, roas: null,
  }));
});

router.get("/budget-plans", async (_req, res): Promise<void> => {
  const rows = await db.select().from(budgetPlansTable).orderBy(desc(budgetPlansTable.createdAt)).limit(50);
  res.json(GetBudgetPlansResponse.parse(rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }))));
});

router.post("/budget-plans", async (req, res): Promise<void> => {
  const parsed = CreateBudgetPlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Use a name, positive whole-number budget, and an allocation for each of the six channels." }); return; }
  const input = parsed.data;
  const sum = input.allocations.reduce((total, row) => total + row.amount, 0);
  if (!input.name.trim() || new Set(input.allocations.map(row => row.channel)).size !== channels.length || sum !== input.totalBudget) {
    res.status(400).json({ error: "Include each channel exactly once, and make allocations add up to the total budget." }); return;
  }
  const [row] = await db.insert(budgetPlansTable).values({
    name: input.name.trim(), totalBudget: input.totalBudget, allocations: input.allocations, note: input.note ?? "",
  }).returning();
  res.status(201).json(CreateBudgetPlanResponse.parse({ ...row!, createdAt: row!.createdAt.toISOString() }));
});

export default router;
