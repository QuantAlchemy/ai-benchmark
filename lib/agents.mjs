import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, readFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { ROOT, SOLUTIONS_DIR, defaultSolutionPath } from "./paths.mjs";

const MAX_OUTPUT_CHARS = 1_000_000;

export const AGENT_DEFINITIONS = [
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    aliases: ["openai", "codex-cli"],
    versionArgs: ["--version"],
    docs: "https://developers.openai.com/codex/cli",
  },
  {
    id: "claude",
    label: "Claude",
    command: "claude",
    aliases: ["claudeAgent", "claude-code"],
    versionArgs: ["--version"],
    docs: "https://claude.com/product/claude-code",
  },
  {
    id: "cursor",
    label: "Cursor Agent",
    command: "agent",
    fallbackCommands: ["cursor-agent"],
    aliases: ["agent", "cursor-agent"],
    versionArgs: ["--version"],
    docs: "https://cursor.com/cli",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    command: null,
    aliases: ["open-router"],
    planned: true,
    docs: "https://openrouter.ai/docs",
  },
];

function hasPathSeparator(value) {
  return value.includes("/") || value.includes("\\");
}

function canExecute(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function candidateExecutableNames(command) {
  if (process.platform !== "win32" || /\.[a-z0-9]+$/i.test(command)) return [command];
  const pathExt = process.env.PATHEXT?.split(";").filter(Boolean) ?? [".EXE", ".CMD", ".BAT"];
  return [command, ...pathExt.map((ext) => `${command}${ext.toLowerCase()}`)];
}

function resolveExecutable(command, env = process.env) {
  if (!command) return null;
  if (hasPathSeparator(command)) {
    const absolute = resolve(command);
    return canExecute(absolute) ? absolute : null;
  }

  const pathEntries = (env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const pathEntry of pathEntries) {
    for (const executableName of candidateExecutableNames(command)) {
      const candidate = join(pathEntry, executableName);
      if (canExecute(candidate)) return candidate;
    }
  }

  return null;
}

function resolveAgentExecutable(definition, env = process.env) {
  const commands = [definition.command, ...(definition.fallbackCommands ?? [])].filter(Boolean);
  for (const command of commands) {
    const path = resolveExecutable(command, env);
    if (path) return { command, path };
  }
  return null;
}

function readVersion(path, args) {
  if (!path || !args?.length) return "";
  const result = spawnSync(path, args, {
    encoding: "utf8",
    timeout: 2500,
    env: process.env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return output.split(/\r?\n/)[0] ?? "";
}

function normalizeAgentId(id) {
  const requested = String(id || "codex").trim();
  const match = AGENT_DEFINITIONS.find(
    (definition) =>
      definition.id.toLowerCase() === requested.toLowerCase() ||
      definition.aliases?.some((alias) => alias.toLowerCase() === requested.toLowerCase()),
  );
  return match?.id ?? requested;
}

export function getAgentDefinition(id) {
  const normalized = normalizeAgentId(id);
  return AGENT_DEFINITIONS.find((definition) => definition.id === normalized) ?? null;
}

export function listAgents(env = process.env) {
  return AGENT_DEFINITIONS.map((definition) => {
    const executable = resolveAgentExecutable(definition, env);
    const configured = definition.id === "openrouter" && Boolean(env.OPENROUTER_API_KEY);
    const runnable = Boolean(executable && !definition.planned);
    return {
      id: definition.id,
      label: definition.label,
      command: executable?.command ?? definition.command,
      path: executable?.path ?? "",
      available: runnable,
      planned: Boolean(definition.planned),
      configured,
      version: runnable ? readVersion(executable.path, definition.versionArgs) : "",
      docs: definition.docs,
      status: runnable
        ? `Ready at ${executable.path}`
        : definition.planned
          ? configured
            ? "Configured for future OpenRouter model runs."
            : "Planned. Set OPENROUTER_API_KEY when API-backed runs are added."
          : `${definition.command} was not found on PATH.`,
    };
  });
}

function resolveSolutionPath(bench, solution) {
  const requested = String(solution ?? "").trim();
  if (!requested) return defaultSolutionPath(bench);
  const candidate = resolve(requested);
  return candidate === resolve(SOLUTIONS_DIR) ? defaultSolutionPath(bench) : candidate;
}

function allocateSolutionPath(bench, solution, options) {
  const resolved = resolveSolutionPath(bench, solution);
  if (!options.versionSolution || resolved !== resolve(defaultSolutionPath(bench))) {
    return resolved;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = options.fastMode || options.serviceTier === "priority" || options.serviceTier === "fast" ? "fast" : "standard";
  const parts = [
    stamp,
    options.agent,
    options.model || "cli-default",
    options.reasoningEffort ? `reasoning-${options.reasoningEffort}` : "reasoning-default",
    `mode-${mode}`,
  ].map(safePathSegment);
  const base = join(defaultSolutionPath(bench), parts.join("__"));
  let candidate = base;
  let index = 2;
  while (existsSync(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function safePathSegment(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "") || "run";
}

function readBenchmarkFile(bench, key, fallbackName) {
  const path = join(bench.dir, bench.files?.[key] ?? fallbackName);
  return existsSync(path) ? readFileSync(path, "utf8").trim() : "";
}

function buildBenchmarkPrompt(bench, solutionPath) {
  const task = readBenchmarkFile(bench, "task", "TASK.md");
  if (!task) {
    throw new Error(`Benchmark "${bench.id}" does not have a readable task file.`);
  }

  const readme = readBenchmarkFile(bench, "readme", "README.md");
  const sourcePath = join(bench.dir, "source");
  const verifyCommand = `pnpm bench verify ${bench.id} --solution ${solutionPath}`;

  return [
    "You are running inside ai-benchmark as the coding agent being evaluated.",
    "",
    `Benchmark: ${bench.name} (${bench.id})`,
    `Repository root: ${ROOT}`,
    `Original source: ${sourcePath}`,
    `Solution directory: ${solutionPath}`,
    `Smoke-test command: ${verifyCommand}`,
    "",
    "Implement the benchmark task in the solution directory. Treat the original source as read-only reference input.",
    "Make reasonable assumptions, do not wait for interactive clarification, and keep unrelated repository files unchanged.",
    "When finished, summarize what changed and whether you ran the smoke test.",
    "",
    "## Task",
    task,
    readme ? "\n## Benchmark README\n" + readme : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildInvocation(definition, input) {
  const args = [];
  let stdin = input.prompt;
  const reasoningEffort = String(input.reasoningEffort ?? "").trim();
  const serviceTier = String(input.serviceTier ?? "").trim();
  const fastMode = Boolean(input.fastMode) || serviceTier === "priority" || serviceTier === "fast";

  switch (definition.id) {
    case "codex":
      args.push(
        "exec",
        "--cd",
        ROOT,
        "--dangerously-bypass-approvals-and-sandbox",
      );
      if (input.model) args.push("--model", input.model);
      if (reasoningEffort) args.push("-c", `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
      if (serviceTier && serviceTier !== "default") args.push("-c", `service_tier=${JSON.stringify(serviceTier)}`);
      args.push("-");
      break;
    case "claude":
      args.push("--print", "--permission-mode", "bypassPermissions", "--output-format", "text");
      if (input.model) args.push("--model", input.model);
      if (reasoningEffort) args.push("--effort", reasoningEffort);
      break;
    case "cursor":
      args.push("--print", "--trust", "--force", "--workspace", ROOT);
      if (input.model) args.push("--model", formatCursorModel(input.model, { reasoningEffort, fastMode }));
      args.push(input.prompt);
      stdin = "";
      break;
    default:
      throw new Error(`Agent "${definition.id}" is registered but does not have a CLI runner yet.`);
  }

  return { args, stdin };
}

function formatCursorModel(model, options) {
  const baseModel = String(model ?? "").trim();
  if (!baseModel || baseModel.includes("[")) return baseModel;

  const traits = [];
  if (options.reasoningEffort) {
    const effort = options.reasoningEffort === "xhigh" ? "extra-high" : options.reasoningEffort;
    traits.push(`effort=${effort}`);
  }
  if (typeof options.fastMode === "boolean") traits.push(`fast=${options.fastMode ? "true" : "false"}`);

  return traits.length ? `${baseModel}[${traits.join(",")}]` : baseModel;
}

function appendCapped(current, chunk) {
  const next = current + String(chunk);
  if (next.length <= MAX_OUTPUT_CHARS) return next;
  return `[output truncated to last ${MAX_OUTPUT_CHARS} characters]\n${next.slice(-MAX_OUTPUT_CHARS)}`;
}

function commandForDisplay(command, args) {
  const renderedArgs = args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg));
  if (renderedArgs.at(-1)?.length > 500) {
    renderedArgs[renderedArgs.length - 1] = "<benchmark prompt>";
  }
  return [command, ...renderedArgs].join(" ");
}

export async function runAgentOnBenchmark(bench, options = {}) {
  const definition = getAgentDefinition(options.agent ?? "codex");
  if (!definition) {
    const ids = AGENT_DEFINITIONS.map((agent) => agent.id).join(", ");
    throw new Error(`Unknown agent "${options.agent}". Available agents: ${ids}`);
  }

  if (definition.planned) {
    return {
      ok: false,
      exitCode: 2,
      command: definition.id,
      durationMs: 0,
      output:
        "OpenRouter is registered as a future model source, but this benchmark runner currently needs a coding-agent runtime with filesystem tools. Use codex, claude, or cursor for now.",
    };
  }

  const executable = resolveAgentExecutable(definition);
  if (!executable) {
    return {
      ok: false,
      exitCode: 127,
      command: definition.command ?? definition.id,
      durationMs: 0,
      output: `${definition.label} is not installed or is not on PATH. Expected command: ${definition.command}.`,
    };
  }

  if (!existsSync(join(bench.dir, "source"))) {
    return {
      ok: false,
      exitCode: 2,
      command: executable.command,
      durationMs: 0,
      output: `Benchmark source is not set up yet. Run: pnpm bench setup ${bench.id}`,
    };
  }

  const model = String(options.model ?? "").trim();
  const solutionPath = allocateSolutionPath(bench, options.solution, {
    versionSolution: Boolean(options.versionSolution),
    agent: definition.id,
    model,
    reasoningEffort: options.reasoningEffort,
    serviceTier: options.serviceTier,
    fastMode: options.fastMode,
  });
  mkdirSync(solutionPath, { recursive: true });

  const prompt = buildBenchmarkPrompt(bench, solutionPath);
  const reasoningEffort = String(options.reasoningEffort ?? "").trim();
  const serviceTier = String(options.serviceTier ?? "").trim();
  const fastMode = Boolean(options.fastMode);
  const invocation = buildInvocation(definition, { prompt, model, reasoningEffort, serviceTier, fastMode });
  const startedAt = Date.now();
  const env = {
    ...process.env,
    BENCH_ID: bench.id,
    BENCH_DIR: bench.dir,
    BENCH_SOURCE: join(bench.dir, "source"),
    BENCH_SOLUTION: solutionPath,
    CI: process.env.CI ?? "1",
    NO_COLOR: process.env.NO_COLOR ?? "1",
  };

  return new Promise((resolvePromise, reject) => {
    let output = "";
    const child = spawn(executable.path, invocation.args, {
      cwd: ROOT,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      output = appendCapped(output, chunk);
    });
    child.stderr.on("data", (chunk) => {
      output = appendCapped(output, chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const exitCode = code ?? 1;
      resolvePromise({
        ok: exitCode === 0,
        exitCode,
        command: commandForDisplay(executable.command, invocation.args),
        durationMs: Date.now() - startedAt,
        output: output.trimEnd(),
        solutionPath,
      });
    });

    child.stdin.end(invocation.stdin);
  });
}

export function agentUsage() {
  return AGENT_DEFINITIONS.map((agent) => {
    const aliases = agent.aliases?.length ? ` aliases: ${agent.aliases.join(", ")}` : "";
    return `${agent.id.padEnd(10)} ${agent.label}${aliases}`;
  }).join("\n");
}
