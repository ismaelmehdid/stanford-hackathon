import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, campaignsTable, campaignVersionsTable, campaignActivityTable } from "@workspace/db";
import {
  GetCampaignsQueryParams, GetCampaignParams, GetCampaignVersionsParams,
  UpdateCampaignParams, SubmitCampaignParams, ReviewCampaignParams,
  CreateCampaignBody, UpdateCampaignBody, ReviewCampaignBody,
  GetCampaignsResponse, GetCampaignResponse, CreateCampaignResponse,
  UpdateCampaignResponse, GetCampaignVersionsResponse, SubmitCampaignResponse,
  ReviewCampaignResponse, GetDashboardResponse, GetActivityResponse,
  ForkCampaignParams, ForkCampaignResponse, ActivateCampaignParams,
  ActivateCampaignResponse, RestoreCampaignVersionParams, RestoreCampaignVersionResponse,
} from "@workspace/api-zod";
import { campaignJson, recordVersion } from "../lib/campaigns";

const router: IRouter = Router();

router.get("/campaigns", async (req, res): Promise<void> => {
  const parsed = GetCampaignsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid campaign filters" }); return; }
  const { q, status } = parsed.data;
  const rows = await db.select().from(campaignsTable).where(and(
    status ? eq(campaignsTable.status, status) : undefined,
    q ? or(ilike(campaignsTable.name, `%${q}%`), ilike(campaignsTable.description, `%${q}%`),
      ilike(campaignsTable.objective, `%${q}%`), ilike(campaignsTable.owner, `%${q}%`)) : undefined,
  )).orderBy(desc(campaignsTable.updatedAt));
  res.json(GetCampaignsResponse.parse(rows.map(campaignJson)));
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.name.trim() || !parsed.data.objective.trim()) {
    res.status(400).json({ error: "Campaign name, channel, and objective are required; budget must be a non-negative whole number." }); return;
  }
  const campaign = await db.transaction(async (tx) => {
    const [row] = await tx.insert(campaignsTable).values({
      ...parsed.data,
      name: parsed.data.name.trim(),
      objective: parsed.data.objective.trim(),
      owner: parsed.data.owner?.trim() || "Marketing team",
    }).returning();
    await recordVersion(tx, row!, "Created campaign");
    return row!;
  });
  res.status(201).json(CreateCampaignResponse.parse(campaignJson(campaign)));
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const parsed = GetCampaignParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid campaign ID" }); return; }
  const [row] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, parsed.data.id));
  if (!row) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(GetCampaignResponse.parse(campaignJson(row)));
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  const params = UpdateCampaignParams.safeParse(req.params);
  const body = UpdateCampaignBody.safeParse(req.body);
  if (!params.success || !body.success || !Object.keys(body.data).some(key => key !== "expectedUpdatedAt") ||
    (body.data.name !== undefined && !body.data.name.trim()) ||
    (body.data.objective !== undefined && !body.data.objective.trim())) {
    res.status(400).json({ error: "Enter a valid campaign brief and non-negative whole-number budget." }); return;
  }
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id)).for("update");
    if (!current) return { status: 404, error: "Campaign not found" } as const;
    const { expectedUpdatedAt, ...changes } = body.data;
    if (expectedUpdatedAt && current.updatedAt.toISOString() !== expectedUpdatedAt.toISOString()) {
      return { status: 409, error: "This brief changed since you opened it. Your edits have not been saved. Refresh the saved brief before trying again." } as const;
    }
    const [updated] = await tx.update(campaignsTable).set({
      ...changes,
      // Editing a reviewed brief requires a fresh review.
      status: current.status === "idea" ? "idea" : "draft",
      revision: current.revision + 1,
      updatedAt: new Date(),
    }).where(eq(campaignsTable.id, current.id)).returning();
    await recordVersion(tx, updated!, "Updated campaign brief");
    return { row: updated! };
  });
  if (result.status !== undefined) { res.status(result.status).json({ error: result.error }); return; }
  res.json(UpdateCampaignResponse.parse(campaignJson(result.row)));
});

router.get("/campaigns/:id/versions", async (req, res): Promise<void> => {
  const parsed = GetCampaignVersionsParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid campaign ID" }); return; }
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, parsed.data.id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const rows = await db.select().from(campaignVersionsTable)
    .where(eq(campaignVersionsTable.campaignId, campaign.id)).orderBy(desc(campaignVersionsTable.version));
  res.json(GetCampaignVersionsResponse.parse(rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }))));
});

router.post("/campaigns/:id/submit", async (req, res): Promise<void> => {
  const parsed = SubmitCampaignParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid campaign ID" }); return; }
  const result = await db.transaction(async tx => {
    const [current] = await tx.select().from(campaignsTable).where(eq(campaignsTable.id, parsed.data.id)).for("update");
    if (!current) return { status: 404, error: "Campaign not found" } as const;
    if (!["idea", "draft"].includes(current.status)) return { status: 409, error: "Only a draft can be submitted for review." } as const;
    const [row] = await tx.update(campaignsTable).set({ status: "in_review", revision: current.revision + 1, updatedAt: new Date() })
      .where(eq(campaignsTable.id, current.id)).returning();
    await recordVersion(tx, row!, "Requested campaign review");
    return { row: row! };
  });
  if (result.status !== undefined) { res.status(result.status).json({ error: result.error }); return; }
  res.json(SubmitCampaignResponse.parse(campaignJson(result.row)));
});

router.post("/campaigns/:id/review", async (req, res): Promise<void> => {
  const params = ReviewCampaignParams.safeParse(req.params);
  const body = ReviewCampaignBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Select approve or request changes." }); return; }
  const result = await db.transaction(async tx => {
    const [current] = await tx.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id)).for("update");
    if (!current) return { status: 404, error: "Campaign not found" } as const;
    if (current.status !== "in_review") return { status: 409, error: "This campaign is not awaiting review." } as const;
    const approved = body.data.decision === "approve";
    const [row] = await tx.update(campaignsTable).set({
      status: approved ? "approved" : "draft", revision: current.revision + 1, updatedAt: new Date(),
    }).where(eq(campaignsTable.id, current.id)).returning();
    const note = body.data.note?.trim();
    await recordVersion(tx, row!, `${approved ? "Approved campaign" : "Requested changes"}${note ? `: ${note}` : ""}`);
    return { row: row! };
  });
  if (result.status !== undefined) { res.status(result.status).json({ error: result.error }); return; }
  res.json(ReviewCampaignResponse.parse(campaignJson(result.row)));
});

router.get("/dashboard", async (_req, res): Promise<void> => {
  const campaigns = await db.select().from(campaignsTable).orderBy(desc(campaignsTable.updatedAt));
  res.json(GetDashboardResponse.parse({
    total: campaigns.length,
    inReview: campaigns.filter(c => c.status === "in_review").length,
    live: campaigns.filter(c => c.status === "live").length,
    approved: campaigns.filter(c => c.status === "approved").length,
    pipelineValue: campaigns.reduce((sum, c) => sum + c.budget, 0),
    campaigns: campaigns.map(campaignJson),
  }));
});

router.post("/campaigns/:id/fork", async (req, res): Promise<void> => {
  const params = ForkCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid campaign ID" }); return; }
  const [source] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id));
  if (!source) { res.status(404).json({ error: "Campaign not found" }); return; }
  const fork = await db.transaction(async tx => {
    const [row] = await tx.insert(campaignsTable).values({
      name: `${source.name} (fork)`, description: source.description,
      channel: source.channel, owner: source.owner, budget: source.budget,
      objective: source.objective, audience: source.audience,
      content: source.content, hypothesis: source.hypothesis, status: "draft",
    }).returning();
    await recordVersion(tx, row!, `Forked from ${source.name}`);
    return row!;
  });
  res.status(201).json(ForkCampaignResponse.parse(campaignJson(fork)));
});

router.post("/campaigns/:id/activate", async (req, res): Promise<void> => {
  const params = ActivateCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid campaign ID" }); return; }
  const result = await db.transaction(async tx => {
    const [current] = await tx.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id)).for("update");
    if (!current) return { status: 404, error: "Campaign not found" } as const;
    if (current.status !== "approved") return { status: 409, error: "Approve the campaign before marking it live." } as const;
    const [row] = await tx.update(campaignsTable).set({
      status: "live", revision: current.revision + 1, updatedAt: new Date(),
    }).where(eq(campaignsTable.id, current.id)).returning();
    await recordVersion(tx, row!, "Marked live internally — external publishing is managed separately");
    return { row: row! };
  });
  if (result.status !== undefined) { res.status(result.status).json({ error: result.error }); return; }
  res.json(ActivateCampaignResponse.parse(campaignJson(result.row)));
});

router.post("/campaigns/:id/versions/:versionId/restore", async (req, res): Promise<void> => {
  const params = RestoreCampaignVersionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid campaign or revision ID" }); return; }
  const result = await db.transaction(async tx => {
    const [current] = await tx.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id)).for("update");
    if (!current) return null;
    const [version] = await tx.select().from(campaignVersionsTable).where(and(
      eq(campaignVersionsTable.campaignId, current.id), eq(campaignVersionsTable.id, params.data.versionId),
    ));
    if (!version) return null;
    const brief = UpdateCampaignBody.parse(version.snapshot);
    const [row] = await tx.update(campaignsTable).set({
      ...brief, status: "draft", revision: current.revision + 1, updatedAt: new Date(),
    }).where(eq(campaignsTable.id, current.id)).returning();
    await recordVersion(tx, row!, `Restored v${version.version} as a new draft`);
    return row!;
  });
  if (!result) { res.status(404).json({ error: "Campaign or revision not found" }); return; }
  res.json(RestoreCampaignVersionResponse.parse(campaignJson(result)));
});

router.get("/activity", async (_req, res): Promise<void> => {
  const rows = await db.select().from(campaignActivityTable).orderBy(desc(campaignActivityTable.createdAt)).limit(30);
  res.json(GetActivityResponse.parse(rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }))));
});

export default router;
