import { createServerFn } from "@tanstack/react-start";
import {
  createScorecard,
  getBenchmarkAgents,
  getBenchmarkFiles,
  getDashboardData,
  runBenchmarkAgent,
  runBenchmarkScript,
} from "./benchmarks.server";

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
  .validator((data: { id: string; agent: string; model?: string; solution?: string }) => data)
  .handler(({ data }) => {
    return runBenchmarkAgent(data.id, data.agent, data.model, data.solution);
  });

export const createBenchmarkScorecard = createServerFn({ method: "POST" })
  .validator((data: { id: string; model: string; force: boolean }) => data)
  .handler(({ data }) => {
    return createScorecard(data.id, data.model, data.force);
  });
