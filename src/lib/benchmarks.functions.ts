import { createServerFn } from "@tanstack/react-start";
import {
  createScorecard,
  getBenchmarkAgents,
  getBenchmarkFiles,
  getBenchmarkRuns,
  getDashboardData,
  removeBenchmarkRun,
  runBenchmarkAgent,
  runBenchmarkScript,
  saveBenchmarkRun,
} from "./benchmarks.server";
import type { ScorecardData } from "./scorecard";

export const loadDashboard = createServerFn({ method: "GET" }).handler(() => {
  return getDashboardData();
});

export const loadBenchmarkAgents = createServerFn({ method: "GET" }).handler(() => {
  return getBenchmarkAgents();
});

export const loadBenchmarkFiles = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(({ data }) => {
    return getBenchmarkFiles(data.id);
  });

export const runBenchmarkAction = createServerFn({ method: "POST" })
  .validator((data: { id: string; action: "setup" | "verify"; solution?: string }) => data)
  .handler(({ data }) => {
    return runBenchmarkScript(data.id, data.action, data.solution);
  });

export const runBenchmarkAgentAction = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      agent: string;
      model?: string;
      reasoningEffort?: string;
      serviceTier?: string;
      fastMode?: boolean;
      solution?: string;
    }) => data,
  )
  .handler(({ data }) => {
    return runBenchmarkAgent(
      data.id,
      data.agent,
      data.model,
      data.reasoningEffort,
      data.serviceTier,
      data.solution,
      data.fastMode,
    );
  });

export const createBenchmarkScorecard = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      model: string;
      force: boolean;
      agent?: string;
      agentModel?: string;
      reasoningEffort?: string;
      serviceTier?: string;
      fastMode?: boolean;
      solution?: string;
      notes?: string;
    }) => data,
  )
  .handler(({ data }) => {
    return createScorecard(data.id, data.model, data.force, {
      agent: data.agent,
      agentModel: data.agentModel,
      reasoningEffort: data.reasoningEffort,
      serviceTier: data.serviceTier,
      solution: data.solution,
      notes: data.notes,
    });
  });

export const loadBenchmarkRuns = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(({ data }) => {
    return getBenchmarkRuns(data.id);
  });

export const saveBenchmarkRunAction = createServerFn({ method: "POST" })
  .validator((data: { id: number; scoreModel: string; scorecardData: unknown; notes: string }) => data)
  .handler(({ data }) => {
    return saveBenchmarkRun({
      id: data.id,
      scoreModel: data.scoreModel,
      scorecardData: data.scorecardData as ScorecardData,
      notes: data.notes,
    });
  });

export const deleteBenchmarkRunAction = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(({ data }) => {
    return removeBenchmarkRun(data.id);
  });
