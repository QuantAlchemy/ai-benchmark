import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { InferSelectModel } from "drizzle-orm";
import type { ScorecardData } from "../scorecard";

export const benchmarkRuns = sqliteTable("benchmark_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  benchmarkId: text("benchmark_id").notNull(),
  benchmarkName: text("benchmark_name").notNull(),
  agentId: text("agent_id"),
  agentModel: text("agent_model"),
  reasoningEffort: text("reasoning_effort"),
  serviceTier: text("service_tier"),
  solutionPath: text("solution_path").notNull(),
  scoreModel: text("score_model").notNull(),
  scorecardPath: text("scorecard_path"),
  scorecardContent: text("scorecard_content").notNull().default(""),
  scorecardData: text("scorecard_data", { mode: "json" }).$type<ScorecardData>().notNull().default({} as ScorecardData),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type BenchmarkRun = InferSelectModel<typeof benchmarkRuns>;
