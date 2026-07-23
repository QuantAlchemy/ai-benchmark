import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readServerSyncConfig, toPublicSyncConfig } from "./config.server";

describe("sync configuration", () => {
  it("uses a per-user XDG data root by default", () => {
    const config = readServerSyncConfig({
      env: {},
      homeDir: "/home/alice",
      projectRoot: "/repo",
    });

    expect(config.dataRoot).toBe(resolve("/home/alice/.local/share/ai-benchmark"));
  });

  it("keeps credentials server-only while allowing isolated data roots", () => {
    const projectRoot = resolve("test-fixtures/project");
    const credentials = {
      AI_BENCHMARK_SYNC_URL: "https://example.convex.site",
      AI_BENCHMARK_SYNC_CLIENT_ID: "client-a",
      AI_BENCHMARK_SYNC_CLIENT_TOKEN: "super-secret-token",
    };
    const replicaA = readServerSyncConfig({
      env: { ...credentials, AI_BENCHMARK_DATA_ROOT: "data/replica-a" },
      projectRoot,
    });
    const replicaB = readServerSyncConfig({
      env: { ...credentials, AI_BENCHMARK_DATA_ROOT: "data/replica-b" },
      projectRoot,
    });

    expect(replicaA.dataRoot).toBe(resolve(projectRoot, "data/replica-a"));
    expect(replicaB.dataRoot).toBe(resolve(projectRoot, "data/replica-b"));

    const publicConfig = toPublicSyncConfig(replicaA);
    expect(publicConfig).toEqual({ syncEnabled: true });
    expect(JSON.stringify(publicConfig)).not.toContain(credentials.AI_BENCHMARK_SYNC_CLIENT_ID);
    expect(JSON.stringify(publicConfig)).not.toContain(credentials.AI_BENCHMARK_SYNC_CLIENT_TOKEN);
  });

  it("loads server-only local env files without requiring browser-prefixed variables", () => {
    const projectRoot = mkdtempSync(resolve(tmpdir(), "sync-config-env-"));
    try {
      writeFileSync(
        resolve(projectRoot, ".env"),
        [
          "AI_BENCHMARK_SYNC_URL=https://example.convex.site",
          "AI_BENCHMARK_SYNC_CLIENT_ID=44444444-4444-4444-8444-444444444444",
          "AI_BENCHMARK_SYNC_CLIENT_TOKEN=server-only-token",
          "",
        ].join("\n"),
      );
      const config = readServerSyncConfig({ env: {}, projectRoot });
      expect(config.credentials).toEqual({
        url: "https://example.convex.site",
        clientId: "44444444-4444-4444-8444-444444444444",
        clientToken: "server-only-token",
      });
      expect(JSON.stringify(toPublicSyncConfig(config))).not.toContain("server-only-token");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});