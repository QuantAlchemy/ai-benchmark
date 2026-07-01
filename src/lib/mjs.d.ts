declare module "*.mjs" {
  export type AgentStatus = {
    id: string;
    label: string;
    command: string | null;
    path: string;
    available: boolean;
    planned: boolean;
    configured: boolean;
    version: string;
    docs: string;
    status: string;
  };

  export function listAgents(): AgentStatus[];
  export function runAgentOnBenchmark(
    benchmark: unknown,
    options?: {
      agent?: string;
      model?: string;
      solution?: string;
    },
  ): Promise<{
    ok: boolean;
    exitCode: number;
    command: string;
    durationMs: number;
    output: string;
  }>;
}
