export type SolutionSizeMetrics = {
  files: number;
  bytes: number;
  lines: number;
  measuredAt: string;
};

export type VerifyMetrics = {
  ok: boolean;
  exitCode: number;
  durationMs: number;
  measuredAt: string;
};

export type LaunchMetrics = {
  ok: boolean;
  url: string | null;
  timeToReadyMs: number | null;
  measuredAt: string;
};

/**
 * Quantitative factors captured automatically by the harness (agent wall time,
 * solution size, verify/launch outcomes). Tracked separately from the manual
 * rubric scorecard, which records human judgment.
 */
export type RunMetrics = {
  version: 1;
  agentDurationMs: number | null;
  solutionSize: SolutionSizeMetrics | null;
  verify: VerifyMetrics | null;
  launch: LaunchMetrics | null;
};

export function emptyRunMetrics(): RunMetrics {
  return {
    version: 1,
    agentDurationMs: null,
    solutionSize: null,
    verify: null,
    launch: null,
  };
}

export function normalizeRunMetrics(value: unknown, fallbackAgentDurationMs?: number | null): RunMetrics {
  const base = emptyRunMetrics();
  base.agentDurationMs = typeof fallbackAgentDurationMs === "number" ? fallbackAgentDurationMs : null;
  if (!value || typeof value !== "object") return base;

  const candidate = value as Partial<RunMetrics>;
  if (typeof candidate.agentDurationMs === "number") base.agentDurationMs = candidate.agentDurationMs;

  const size = candidate.solutionSize;
  if (size && typeof size === "object" && typeof size.files === "number") {
    base.solutionSize = {
      files: size.files,
      bytes: Number(size.bytes) || 0,
      lines: Number(size.lines) || 0,
      measuredAt: String(size.measuredAt || ""),
    };
  }

  const verify = candidate.verify;
  if (verify && typeof verify === "object" && typeof verify.exitCode === "number") {
    base.verify = {
      ok: Boolean(verify.ok),
      exitCode: verify.exitCode,
      durationMs: Number(verify.durationMs) || 0,
      measuredAt: String(verify.measuredAt || ""),
    };
  }

  const launch = candidate.launch;
  if (launch && typeof launch === "object" && "ok" in launch) {
    base.launch = {
      ok: Boolean(launch.ok),
      url: typeof launch.url === "string" ? launch.url : null,
      timeToReadyMs: typeof launch.timeToReadyMs === "number" ? launch.timeToReadyMs : null,
      measuredAt: String(launch.measuredAt || ""),
    };
  }

  return base;
}

export function formatMetricBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMetricDuration(ms: number | null) {
  if (ms === null) return "not recorded";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
