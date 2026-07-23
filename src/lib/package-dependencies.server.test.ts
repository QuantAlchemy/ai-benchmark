import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ensurePackageDependencies } from "./package-dependencies.server";

async function makePackage(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "package-dependencies-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content);
  }
  return root;
}

describe("package dependency preparation", () => {
  it("restores omitted npm dependencies before a synchronized package is launched", async () => {
    const solutionPath = await makePackage({
      "package.json": JSON.stringify({ dependencies: { phaser: "^3.90.0" } }),
      "package-lock.json": "{}\n",
    });
    const run = vi.fn(async () => ({ exitCode: 0, output: "installed" }));

    await expect(ensurePackageDependencies(solutionPath, run)).resolves.toEqual({
      installed: true,
      command: "npm ci",
      output: "installed",
    });
    expect(run).toHaveBeenCalledWith("npm", ["ci"], solutionPath);
  });

  it("does not reinstall dependencies already present locally", async () => {
    const solutionPath = await makePackage({
      "package.json": JSON.stringify({ dependencies: { phaser: "^3.90.0" } }),
      "package-lock.json": "{}\n",
    });
    await mkdir(join(solutionPath, "node_modules", "phaser"), { recursive: true });
    const run = vi.fn();

    await expect(ensurePackageDependencies(solutionPath, run)).resolves.toEqual({
      installed: false,
      command: null,
      output: "",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("retries after a failed install leaves an incomplete node_modules directory", async () => {
    const solutionPath = await makePackage({
      "package.json": JSON.stringify({ dependencies: { phaser: "^3.90.0" } }),
      "package-lock.json": "{}\n",
    });
    const run = vi
      .fn()
      .mockImplementationOnce(async () => {
        await mkdir(join(solutionPath, "node_modules"));
        return { exitCode: 1, output: "interrupted" };
      })
      .mockResolvedValueOnce({ exitCode: 0, output: "installed" });

    await expect(ensurePackageDependencies(solutionPath, run)).rejects.toThrow("interrupted");
    await expect(ensurePackageDependencies(solutionPath, run)).resolves.toMatchObject({ installed: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent dependency restoration for the same synchronized solution", async () => {
    const solutionPath = await makePackage({
      "package.json": JSON.stringify({ dependencies: { phaser: "^3.90.0" } }),
      "package-lock.json": "{}\n",
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = vi.fn(async () => {
      await gate;
      return { exitCode: 0, output: "installed" };
    });

    const first = ensurePackageDependencies(solutionPath, run);
    const second = ensurePackageDependencies(solutionPath, run);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { installed: true, command: "npm ci", output: "installed" },
      { installed: true, command: "npm ci", output: "installed" },
    ]);
  });

  it("does not create a lockfile while restoring dependencies for a lockless candidate", async () => {
    const solutionPath = await makePackage({
      "package.json": JSON.stringify({ dependencies: { phaser: "^3.90.0" } }),
    });
    const run = vi.fn(async () => ({ exitCode: 0, output: "installed" }));

    await expect(ensurePackageDependencies(solutionPath, run)).resolves.toMatchObject({
      installed: true,
      command: "pnpm install --lockfile=false",
    });
    expect(run).toHaveBeenCalledWith("pnpm", ["install", "--lockfile=false"], solutionPath);
  });

  it("returns an actionable error when dependency restoration fails", async () => {
    const solutionPath = await makePackage({
      "package.json": JSON.stringify({ devDependencies: { vite: "^7.1.0" } }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    const run = vi.fn(async () => ({ exitCode: 1, output: "registry unavailable" }));

    await expect(ensurePackageDependencies(solutionPath, run)).rejects.toThrow(
      "Dependency preparation failed (pnpm install --frozen-lockfile): registry unavailable",
    );
  });
});
