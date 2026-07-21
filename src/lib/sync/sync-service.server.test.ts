import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateRunPush } from "../../../convex/protocol";
import { createRunHistoryStore } from "../run-history.server";
import { createScorecardData } from "../scorecard";
import { packageSolutionArtifact, type PackagedSolutionArtifact } from "./artifacts.server";
import { openLocalStore } from "./local-store.server";
import {
  SyncService,
  type PullEventsResult,
  type RemoteArtifactMetadata,
  type RemoteSyncEvent,
  type SyncOutboxOperation,
  type SyncTransport,
} from "./sync-service.server";

const temporaryRoots: string[] = [];

async function temporaryRoot(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

class MemoryTransport implements SyncTransport {
  readonly artifacts = new Map<string, { metadata: RemoteArtifactMetadata; bytes: Buffer }>();
  readonly events: RemoteSyncEvent[] = [];
  readonly receipts = new Map<string, number>();
  throwAfterFirstAcceptedPush = false;
  authenticatedClientId: string | null = null;
  #didThrowAfterPush = false;
  #verifiedClientId: string | null = null;

  async verifyAuthenticatedClient(expectedClientId: string) {
    if (this.authenticatedClientId && this.authenticatedClientId !== expectedClientId) {
      throw new Error("Authenticated client does not match local identity");
    }
    this.#verifiedClientId = this.authenticatedClientId ?? expectedClientId;
  }

  async artifactExists(artifactDigest: string) {
    return this.artifacts.has(artifactDigest);
  }

  async uploadArtifact(artifact: PackagedSolutionArtifact) {
    const bytes = await readFile(artifact.artifactPath);
    expect(sha256(bytes)).toBe(artifact.artifactSha256);
    this.artifacts.set(artifact.artifactSha256, {
      bytes,
      metadata: {
        artifactDigest: artifact.artifactSha256,
        artifactSize: artifact.artifactSize,
        manifest: artifact.manifest,
        chunks: artifact.chunks,
      },
    });
  }

  async downloadArtifact(artifactDigest: string, destinationPath: string) {
    const artifact = this.artifacts.get(artifactDigest);
    if (!artifact) throw new Error("remote artifact not found");
    await mkdir(dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, artifact.bytes);
    return artifact.metadata;
  }

  async pushOperation(operation: SyncOutboxOperation) {
    const payload = JSON.parse(operation.payloadJson) as { run?: { artifactDigest?: string | null } };
    validateRunPush({
      operationId: operation.operationId,
      runUid: operation.runUid,
      eventKind: operation.operationType === "upsert" ? "snapshot" : "tombstone",
      payloadJson: operation.payloadJson,
      ...(payload.run?.artifactDigest ? { artifactDigest: payload.run.artifactDigest } : {}),
    });
    const existing = this.receipts.get(operation.operationId);
    if (existing !== undefined) return { sequence: existing };
    const sequence = this.events.length + 1;
    this.receipts.set(operation.operationId, sequence);
    this.events.push({
      sequence,
      operationId: operation.operationId,
      operationType: operation.operationType,
      runUid: operation.runUid,
      payloadJson: operation.payloadJson,
      actorClientId: this.#verifiedClientId ?? "remote-test-client",
      createdAt: new Date().toISOString(),
    });
    if (this.throwAfterFirstAcceptedPush && !this.#didThrowAfterPush) {
      this.#didThrowAfterPush = true;
      throw new Error("connection dropped after remote commit");
    }
    return { sequence };
  }

  async pullEvents(afterSequence: number, limit: number): Promise<PullEventsResult> {
    const events = this.events.filter((event) => event.sequence > afterSequence).slice(0, limit);
    return { events, latestSequence: events.at(-1)?.sequence ?? afterSequence };
  }
}

class OfflineTransport implements SyncTransport {
  async verifyAuthenticatedClient(): Promise<void> {
    throw new Error("offline");
  }
  async artifactExists(): Promise<boolean> {
    throw new Error("offline");
  }
  async uploadArtifact(): Promise<void> {
    throw new Error("offline");
  }
  async downloadArtifact(): Promise<RemoteArtifactMetadata> {
    throw new Error("offline");
  }
  async pushOperation(): Promise<{ sequence: number }> {
    throw new Error("offline");
  }
  async pullEvents(): Promise<PullEventsResult> {
    throw new Error("offline");
  }
}

async function createSolution(projectRoot: string, runName = "run-a") {
  const solutionPath = join(projectRoot, "solutions", "voidbreaker", runName);
  await mkdir(join(solutionPath, "dist"), { recursive: true });
  await mkdir(join(solutionPath, "src"), { recursive: true });
  await writeFile(join(solutionPath, "dist", "index.html"), "<!doctype html><title>synced</title>\n");
  await writeFile(join(solutionPath, "src", "main.ts"), "export const synced = true;\n");
  await writeFile(join(solutionPath, "package.json"), '{"scripts":{"build":"vite build"}}\n');
  return solutionPath;
}

function createRun(dataRoot: string, projectRoot: string, solutionPath: string) {
  const history = createRunHistoryStore({ dataRoot, projectRoot });
  const scorecardContent = "# Scorecard\n";
  const run = history.createBenchmarkRun({
    benchmarkId: "voidbreaker",
    benchmarkName: "Voidbreaker",
    agentId: "claude",
    agentModel: "sonnet",
    solutionPath,
    scoreModel: "manual",
    scorecardContent,
    scorecardData: createScorecardData(scorecardContent),
    notes: "",
  });
  history.close();
  return run;
}

describe("offline-first synchronization service", () => {
  it("refuses to synchronize a data root bound to a different provisioned client", async () => {
    const dataRoot = await temporaryRoot("sync-identity-data-");
    const projectRoot = await temporaryRoot("sync-identity-project-");
    const first = openLocalStore({ dataRoot, clientId: "66666666-6666-4666-8666-666666666666" });
    first.close();
    const service = new SyncService({
      dataRoot,
      projectRoot,
      clientId: "77777777-7777-4777-8777-777777777777",
      transport: new MemoryTransport(),
    });

    await expect(service.syncOnce({ force: true })).rejects.toThrow("different client identity");
  });

  it("rejects a bearer token provisioned for a different client before push or pull", async () => {
    const dataRoot = await temporaryRoot("sync-token-data-");
    const projectRoot = await temporaryRoot("sync-token-project-");
    const localClientId = "66666666-6666-4666-8666-666666666666";
    const store = openLocalStore({ dataRoot, clientId: localClientId });
    store.close();
    createRun(dataRoot, projectRoot, await createSolution(projectRoot));
    const backend = new MemoryTransport();
    backend.authenticatedClientId = "77777777-7777-4777-8777-777777777777";
    const service = new SyncService({ dataRoot, projectRoot, clientId: localClientId, transport: backend });

    const result = await service.syncOnce({ force: true });

    expect(result.errors.join("\n")).toContain("does not match");
    expect(backend.events).toHaveLength(0);
  });

  it("preserves offline writes and retry state across restart", async () => {
    const dataRoot = await temporaryRoot("sync-offline-data-");
    const projectRoot = await temporaryRoot("sync-offline-project-");
    createRun(dataRoot, projectRoot, await createSolution(projectRoot));

    const offline = new SyncService({ dataRoot, projectRoot, transport: new OfflineTransport() });
    const first = await offline.syncOnce({ force: true });
    expect(first.errors).not.toHaveLength(0);
    const failedStore = openLocalStore({ dataRoot });
    expect(failedStore.prepare("SELECT last_error FROM sync_state WHERE scope = 'remote'").get()).toMatchObject({
      last_error: expect.stringContaining("offline"),
    });
    failedStore.close();

    const backend = new MemoryTransport();
    const restarted = new SyncService({ dataRoot, projectRoot, transport: backend });
    const deferred = await restarted.syncOnce();
    expect(deferred.pushed).toBe(0);
    expect(backend.events).toHaveLength(0);
    const recovered = await restarted.syncOnce({ force: true });
    expect(recovered.pushed).toBe(1);
    expect(backend.events).toHaveLength(1);
    const recoveredStore = openLocalStore({ dataRoot });
    const state = recoveredStore
      .prepare("SELECT last_sync_at, last_error FROM sync_state WHERE scope = 'remote'")
      .get() as { last_sync_at: string | null; last_error: string | null };
    recoveredStore.close();
    expect(state.last_sync_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(state.last_error).toBeNull();
  });

  it("retries an ambiguous post-commit failure without duplicating the canonical event", async () => {
    const dataRoot = await temporaryRoot("sync-idempotent-data-");
    const projectRoot = await temporaryRoot("sync-idempotent-project-");
    createRun(dataRoot, projectRoot, await createSolution(projectRoot));
    const backend = new MemoryTransport();
    backend.throwAfterFirstAcceptedPush = true;
    const service = new SyncService({ dataRoot, projectRoot, transport: backend });

    const ambiguous = await service.syncOnce({ force: true });
    expect(ambiguous.errors).not.toHaveLength(0);
    const retried = await service.syncOnce({ force: true });

    expect(retried.pushed).toBe(1);
    expect(backend.events).toHaveLength(1);
    expect(backend.receipts.size).toBe(1);
  });

  it("rejects a corrupt pre-existing immutable artifact cache entry instead of overwriting or uploading it", async () => {
    const dataRoot = await temporaryRoot("sync-cache-data-");
    const projectRoot = await temporaryRoot("sync-cache-project-");
    const solutionPath = await createSolution(projectRoot);
    createRun(dataRoot, projectRoot, solutionPath);
    const referencePath = join(dataRoot, "reference.tar.gz");
    const reference = await packageSolutionArtifact({ solutionDir: solutionPath, artifactPath: referencePath });
    const cachePath = join(dataRoot, "artifacts", `${reference.artifactSha256}.tar.gz`);
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, "corrupt immutable cache entry");
    const backend = new MemoryTransport();

    const result = await new SyncService({ dataRoot, projectRoot, transport: backend }).syncOnce({ force: true });

    expect(result.errors.join("\n")).toContain("Immutable artifact cache collision");
    expect(backend.events).toHaveLength(0);
    expect(await readFile(cachePath, "utf8")).toBe("corrupt immutable cache entry");
  });

  it("keeps every verified destination trusted when runs share one artifact digest", async () => {
    const projectRootA = await temporaryRoot("sync-shared-artifact-project-a-");
    const projectRootB = await temporaryRoot("sync-shared-artifact-project-b-");
    const dataRootA = await temporaryRoot("sync-shared-artifact-data-a-");
    const dataRootB = await temporaryRoot("sync-shared-artifact-data-b-");
    createRun(dataRootA, projectRootA, await createSolution(projectRootA, "run-a"));
    createRun(dataRootA, projectRootA, await createSolution(projectRootA, "run-b"));
    const backend = new MemoryTransport();

    const pushed = await new SyncService({ dataRoot: dataRootA, projectRoot: projectRootA, transport: backend }).syncOnce({
      force: true,
    });
    expect(pushed).toMatchObject({ pushed: 2, uploaded: 1 });
    const replicaB = new SyncService({ dataRoot: dataRootB, projectRoot: projectRootB, transport: backend });
    const pulled = await replicaB.syncOnce({ force: true });
    expect(pulled).toMatchObject({ pulled: 2, downloaded: 1, materialized: 2 });

    const historyB = createRunHistoryStore({ dataRoot: dataRootB, projectRoot: projectRootB });
    const runs = historyB.listBenchmarkRuns();
    historyB.close();
    expect(runs).toHaveLength(2);
    expect(runs[0]!.artifactDigest).toBe(runs[1]!.artifactDigest);
    expect(runs[0]!.solutionPath).not.toBe(runs[1]!.solutionPath);
    const offline = new SyncService({ dataRoot: dataRootB, projectRoot: projectRootB, transport: new OfflineTransport() });
    await expect(offline.ensureMaterialized(runs[0]!.id)).resolves.toBe(runs[0]!.solutionPath);
    await expect(offline.ensureMaterialized(runs[1]!.id)).resolves.toBe(runs[1]!.solutionPath);
  });

  it("reassigns a destination to its newest digest without preserving stale trust", async () => {
    const projectRootA = await temporaryRoot("sync-reassign-project-a-");
    const projectRootB = await temporaryRoot("sync-reassign-project-b-");
    const dataRootA = await temporaryRoot("sync-reassign-data-a-");
    const dataRootB = await temporaryRoot("sync-reassign-data-b-");
    const sourcePath = await createSolution(projectRootA, "shared-path");
    createRun(dataRootA, projectRootA, sourcePath);
    const backend = new MemoryTransport();
    const replicaA = new SyncService({ dataRoot: dataRootA, projectRoot: projectRootA, transport: backend });
    const replicaB = new SyncService({ dataRoot: dataRootB, projectRoot: projectRootB, transport: backend });

    expect(await replicaA.syncOnce({ force: true })).toMatchObject({ pushed: 1, uploaded: 1 });
    expect(await replicaB.syncOnce({ force: true })).toMatchObject({ pulled: 1, materialized: 1 });
    await writeFile(join(sourcePath, "dist", "index.html"), "<!doctype html><title>new digest</title>\n");
    createRun(dataRootA, projectRootA, sourcePath);
    expect(await replicaA.syncOnce({ force: true })).toMatchObject({ pushed: 1, uploaded: 1 });

    const historyBefore = createRunHistoryStore({ dataRoot: dataRootB, projectRoot: projectRootB });
    const sharedDestination = historyBefore.listBenchmarkRuns()[0]!.solutionPath;
    historyBefore.close();
    await rm(sharedDestination, { recursive: true, force: true });
    const reassigned = await replicaB.syncOnce({ force: true });
    expect(reassigned).toMatchObject({ pulled: 1, downloaded: 1, materialized: 1, errors: [] });

    const historyAfter = createRunHistoryStore({ dataRoot: dataRootB, projectRoot: projectRootB });
    const runs = historyAfter.listBenchmarkRuns();
    historyAfter.close();
    expect(new Set(runs.map((run) => run.artifactDigest)).size).toBe(2);
    const offline = new SyncService({ dataRoot: dataRootB, projectRoot: projectRootB, transport: new OfflineTransport() });
    const newest = runs[0]!;
    const oldest = runs[1]!;
    await expect(offline.ensureMaterialized(newest.id)).resolves.toBe(sharedDestination);
    await expect(offline.ensureMaterialized(oldest.id)).rejects.toThrow("destination already exists");
  });

  it("propagates a locally produced tombstone through the strict remote protocol", async () => {
    const projectRootA = await temporaryRoot("sync-delete-project-a-");
    const projectRootB = await temporaryRoot("sync-delete-project-b-");
    const dataRootA = await temporaryRoot("sync-delete-data-a-");
    const dataRootB = await temporaryRoot("sync-delete-data-b-");
    const run = createRun(dataRootA, projectRootA, await createSolution(projectRootA));
    const backend = new MemoryTransport();
    const replicaA = new SyncService({ dataRoot: dataRootA, projectRoot: projectRootA, transport: backend });
    const replicaB = new SyncService({ dataRoot: dataRootB, projectRoot: projectRootB, transport: backend });
    expect(await replicaA.syncOnce({ force: true })).toMatchObject({ pushed: 1, errors: [] });
    expect(await replicaB.syncOnce({ force: true })).toMatchObject({ pulled: 1, errors: [] });

    const historyA = createRunHistoryStore({ dataRoot: dataRootA, projectRoot: projectRootA });
    historyA.deleteBenchmarkRun(run.id);
    historyA.close();
    expect(await replicaA.syncOnce({ force: true })).toMatchObject({ pushed: 1, errors: [] });
    expect(backend.events.at(-1)).toMatchObject({ runUid: run.runUid, operationType: "delete" });
    expect(await replicaB.syncOnce({ force: true })).toMatchObject({ pulled: 1, errors: [] });
    const historyB = createRunHistoryStore({ dataRoot: dataRootB, projectRoot: projectRootB });
    expect(historyB.listBenchmarkRuns()).toHaveLength(0);
    historyB.close();
  });

  it("syncs a complete run and artifact into an independent replica that rematerializes offline", async () => {
    const dataRootA = await temporaryRoot("sync-replica-a-data-");
    const projectRootA = await temporaryRoot("sync-replica-a-project-");
    const dataRootB = await temporaryRoot("sync-replica-b-data-");
    const projectRootB = await temporaryRoot("sync-replica-b-project-");
    const runA = createRun(dataRootA, projectRootA, await createSolution(projectRootA));
    const backend = new MemoryTransport();

    const pushed = await new SyncService({ dataRoot: dataRootA, projectRoot: projectRootA, transport: backend }).syncOnce({
      force: true,
    });
    expect(pushed).toMatchObject({ pushed: 1, uploaded: 1 });

    const replicaB = new SyncService({ dataRoot: dataRootB, projectRoot: projectRootB, transport: backend });
    const unverifiedDestination = join(projectRootB, "solutions", "voidbreaker", "run-a");
    await mkdir(unverifiedDestination, { recursive: true });
    await writeFile(join(unverifiedDestination, "index.html"), "unverified collision");
    const rejected = await replicaB.syncOnce({ force: true });
    expect(rejected.errors.join("\n")).toContain("Materialization destination already exists");
    const failedReplicaStore = openLocalStore({ dataRoot: dataRootB });
    expect(
      failedReplicaStore.prepare("SELECT last_error FROM sync_state WHERE scope = 'remote'").get(),
    ).toMatchObject({ last_error: expect.stringContaining("Materialization destination already exists") });
    failedReplicaStore.close();
    expect(await readFile(join(unverifiedDestination, "index.html"), "utf8")).toBe("unverified collision");
    const cacheStore = openLocalStore({ dataRoot: dataRootB });
    const cached = cacheStore.prepare("SELECT archive_path FROM local_artifacts").get() as { archive_path: string };
    cacheStore.close();
    await writeFile(cached.archive_path, "corrupt downloaded cache");
    await rm(unverifiedDestination, { recursive: true, force: true });
    const pulled = await replicaB.syncOnce({ force: true });
    expect(pulled).toMatchObject({ pulled: 0, downloaded: 1, materialized: 1 });
    const healthyReplicaStore = openLocalStore({ dataRoot: dataRootB });
    expect(healthyReplicaStore.prepare("SELECT last_error FROM sync_state WHERE scope = 'remote'").get()).toEqual({
      last_error: null,
    });
    healthyReplicaStore.close();

    const historyB = createRunHistoryStore({ dataRoot: dataRootB, projectRoot: projectRootB });
    const [runB] = historyB.listBenchmarkRuns();
    historyB.close();
    expect(runB?.runUid).toBe(runA.runUid);
    expect(runB?.artifactDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(runB && existsSync(runB.solutionPath)).toBe(true);
    expect(await readFile(join(runB!.solutionPath, "dist", "index.html"), "utf8")).toContain("synced");

    await rm(runB!.solutionPath, { recursive: true, force: true });
    const offlineReplica = new SyncService({
      dataRoot: dataRootB,
      projectRoot: projectRootB,
      transport: new OfflineTransport(),
    });
    const materializedPath = await offlineReplica.ensureMaterialized(runB!.id);
    expect(await readFile(join(materializedPath, "src", "main.ts"), "utf8")).toContain("synced = true");
  });
});
