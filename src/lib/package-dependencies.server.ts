import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type DependencyCommandResult = {
  exitCode: number;
  output: string;
};

export type DependencyCommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<DependencyCommandResult>;

export type DependencyPreparationResult = {
  installed: boolean;
  command: string | null;
  output: string;
};

function dependencyInstallCommand(solutionPath: string): { command: string; args: string[] } {
  if (existsSync(join(solutionPath, "package-lock.json"))) return { command: "npm", args: ["ci"] };
  if (existsSync(join(solutionPath, "yarn.lock"))) {
    return { command: "yarn", args: ["install", "--frozen-lockfile"] };
  }
  if (existsSync(join(solutionPath, "pnpm-lock.yaml"))) {
    return { command: "pnpm", args: ["install", "--frozen-lockfile"] };
  }
  return { command: "pnpm", args: ["install", "--lockfile=false"] };
}

async function runDependencyCommand(command: string, args: string[], cwd: string): Promise<DependencyCommandResult> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const child = spawn(command, args, { cwd, env: process.env });
    child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, output: chunks.join("").trimEnd() }));
  });
}

const activePreparations = new Map<string, Promise<DependencyPreparationResult>>();

async function preparePackageDependencies(
  solutionPath: string,
  run: DependencyCommandRunner,
): Promise<DependencyPreparationResult> {
  const packagePath = join(solutionPath, "package.json");
  if (!existsSync(packagePath)) return { installed: false, command: null, output: "" };

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dependencyNames = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ];
  if (dependencyNames.length === 0) return { installed: false, command: null, output: "" };
  const dependenciesPresent = dependencyNames.every((name) =>
    existsSync(join(solutionPath, "node_modules", ...name.split("/"))),
  );
  if (dependenciesPresent) return { installed: false, command: null, output: "" };

  const { command, args } = dependencyInstallCommand(solutionPath);
  const renderedCommand = [command, ...args].join(" ");
  const result = await run(command, args, solutionPath);
  if (result.exitCode !== 0) {
    throw new Error(
      `Dependency preparation failed (${renderedCommand})${result.output ? `: ${result.output}` : ""}`,
    );
  }
  return { installed: true, command: renderedCommand, output: result.output };
}

export function ensurePackageDependencies(
  solutionPath: string,
  run: DependencyCommandRunner = runDependencyCommand,
): Promise<DependencyPreparationResult> {
  const key = resolve(solutionPath);
  const active = activePreparations.get(key);
  if (active) return active;

  const preparation = preparePackageDependencies(key, run).finally(() => {
    if (activePreparations.get(key) === preparation) activePreparations.delete(key);
  });
  activePreparations.set(key, preparation);
  return preparation;
}
