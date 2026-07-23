import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { openLocalStore } from "../src/lib/sync/local-store.server";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "ai-benchmark-sync-cli-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

function cliEnvironment(dataRoot: string) {
  const env = { ...process.env, AI_BENCHMARK_DATA_ROOT: dataRoot };
  delete env.AI_BENCHMARK_SYNC_URL;
  delete env.AI_BENCHMARK_SYNC_CLIENT_ID;
  delete env.AI_BENCHMARK_SYNC_CLIENT_TOKEN;
  return env;
}

function seedFailedOperation(dataRoot: string, operationId: string) {
  const store = openLocalStore({ dataRoot });
  store
    .prepare(
      `INSERT INTO sync_outbox (
         operation_id, run_uid, operation_type, payload_json, status, attempt_count,
         dead_lettered_at, last_error, created_at, updated_at
       ) VALUES (?, 'run-1', 'upsert', '{}', 'failed', 8, '2026-01-01T00:00:00.000Z',
                 'permanent failure', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    )
    .run(operationId);
  store.close();
}

describe("sync failure CLI remediation", () => {
  it("lists and retries a failed operation", async () => {
    const dataRoot = await temporaryRoot();
    const operationId = "operation-retry";
    seedFailedOperation(dataRoot, operationId);

    const listed = await execFileAsync(
      process.execPath,
      [resolve("bin/bench.mjs"), "sync-failures"],
      {
        cwd: resolve("."),
        env: cliEnvironment(dataRoot),
      },
    );
    expect(listed.stdout).toContain(operationId);
    expect(listed.stdout).toContain("permanent failure");

    await execFileAsync(
      process.execPath,
      [resolve("bin/bench.mjs"), "sync-retry", operationId],
      {
        cwd: resolve("."),
        env: cliEnvironment(dataRoot),
      },
    );
    const store = openLocalStore({ dataRoot });
    expect(
      store
        .prepare(
          "SELECT status, attempt_count, dead_lettered_at FROM sync_outbox",
        )
        .get(),
    ).toEqual({
      status: "pending",
      attempt_count: 0,
      dead_lettered_at: null,
    });
    store.close();
  });

  it("discards a failed operation only when explicitly requested", async () => {
    const dataRoot = await temporaryRoot();
    const operationId = "operation-discard";
    seedFailedOperation(dataRoot, operationId);

    await execFileAsync(
      process.execPath,
      [resolve("bin/bench.mjs"), "sync-discard", operationId],
      {
        cwd: resolve("."),
        env: cliEnvironment(dataRoot),
      },
    );

    const store = openLocalStore({ dataRoot });
    expect(store.prepare("SELECT 1 FROM sync_outbox").get()).toBeUndefined();
    store.close();
  });
});
