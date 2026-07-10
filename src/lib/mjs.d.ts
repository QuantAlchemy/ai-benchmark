declare module "*.mjs" {
  export type AgentModelStatus = {
    value: string;
    label: string;
    description?: string;
    supportsServiceTier?: boolean;
    supportsFastMode?: boolean;
    isExactModel?: boolean;
    resolvedModel?: string;
    reasoningEfforts?: Array<{ value: string; label: string; description?: string }>;
    defaultReasoningEffort?: string;
  };

  export type AgentStatus = {
    id: string;
    label: string;
    command: string | null;
    path: string;
    available: boolean;
    planned: boolean;
    configured: boolean;
    version: string;
    models: AgentModelStatus[];
    docs: string;
    status: string;
  };

  export function listAgents(): AgentStatus[];
  export function runAgentOnBenchmark(
    benchmark: unknown,
    options?: {
      agent?: string;
      model?: string;
      reasoningEffort?: string;
      serviceTier?: string;
      fastMode?: boolean;
      versionSolution?: boolean;
      solution?: string;
    },
  ): Promise<{
    ok: boolean;
    exitCode: number;
    command: string;
    durationMs: number;
    output: string;
    solutionPath?: string;
    model?: string;
    requestedModel?: string;
  }>;
}
