import { pgTable, uuid, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const budgetPlansTable = pgTable("budget_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  totalBudget: integer("total_budget").notNull(),
  allocations: jsonb("allocations").$type<{ channel: string; amount: number }[]>().notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
