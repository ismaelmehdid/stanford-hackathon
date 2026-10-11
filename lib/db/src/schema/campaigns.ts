import { pgTable, uuid, text, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const campaignsTable = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("draft"),
  owner: text("owner").notNull().default("Marketing team"),
  budget: integer("budget").notNull().default(0),
  objective: text("objective").notNull(),
  audience: text("audience").notNull().default(""),
  content: text("content").notNull().default(""),
  hypothesis: text("hypothesis").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaignVersionsTable = pgTable("campaign_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("campaign_version_unique").on(table.campaignId, table.version)]);

export const campaignActivityTable = pgTable("campaign_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  campaignName: text("campaign_name").notNull(),
  actor: text("actor").notNull().default("Marketing team"),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CampaignRow = typeof campaignsTable.$inferSelect;
