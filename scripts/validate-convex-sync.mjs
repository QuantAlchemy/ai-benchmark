#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { tsImport } from "tsx/esm/api";

const root = await mkdtemp(join(tmpdir(), "ai-benchmark-sync-acceptance-"));
const projectRootA = join(root, "replica-a-project");
const projectRootB = join(root, "replica-b-project");
const dataRootA = join(root, "replica-a-data");
const dataRootB = join(root, "replica-b-data");
const tokenA = "acceptance-client-a-token";
const tokenB = "acceptance-client-b-token";

const [
  { ConvexHttpSyncTransport },
  { SyncService },
  { createRunHistoryStore },
  { createScorecardData },
  { openLocalStore },
] =
  await Promise.all([
    tsImport("../src/lib/sync/convex-transport.server.ts", import.meta.url),
    tsImport("../src/lib/sync/sync-service.server.ts", import.meta.url),
    tsImport("../src/lib/run-history.server.ts", import.meta.url),
    tsImport("../src/lib/scorecard.ts", import.meta.url),
    tsImport("../src/lib/sync/local-store.server.ts", import.meta.url),
  ]);

const events = [];
const receipts = new Map();
const uploads = new Map();
const artifacts = new Map();
const clients = new Map();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

async function mockFetch(input, init = {}) {
  const request = input instanceof Request ? input : new Request(String(input), init);
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.startsWith("/upload/")) {
    const bytes = Buffer.from(await request.arrayBuffer());
    const storageId = path.slice("/upload/".length);
    uploads.set(storageId, bytes);
    return json({ storageId });
  }
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  const actorClientId = clients.get(token);
  if (!actorClientId) return json({ error: "Unauthorized" }, 401);

  if (path === "/api/sync/status" && request.method === "GET") {
    return json({ ok: true, currentSequence: events.length, clientId: actorClientId });
  }

  if (path === "/api/sync/artifacts/upload-url" && request.method === "POST") {
    return json({ uploadUrl: `https://sync.test/upload/${randomUUID()}` });
  }
  if (path === "/api/sync/artifacts/finalize" && request.method === "POST") {
    const body = await request.json();
    const chunks = body.chunks.map((chunk) => {
      const bytes = uploads.get(chunk.storageId);
      if (!bytes || bytes.length !== chunk.sizeBytes || sha256(bytes) !== chunk.sha256) {
        throw new Error("Mock backend rejected invalid chunk");
      }
      return { ...chunk, bytes };
    });
    const complete = Buffer.concat(chunks.map((chunk) => chunk.bytes));
    if (complete.length !== body.sizeBytes || sha256(complete) !== body.digest) {
      return json({ error: "Artifact digest mismatch" }, 400);
    }
    const created = !artifacts.has(body.digest);
    artifacts.set(body.digest, {
      artifactDigest: body.digest,
      artifactSize: body.sizeBytes,
      manifestJson: body.manifestJson,
      chunks,
    });
    return json({ digest: body.digest, created }, created ? 201 : 200);
  }
  const artifactMatch = path.match(/^\/api\/sync\/artifacts\/([a-f0-9]{64})$/);
  if (artifactMatch) {
    const artifact = artifacts.get(artifactMatch[1]);
    if (!artifact) return json({ error: "Not found" }, 404);
    return json({
      artifactDigest: artifact.artifactDigest,
      artifactSize: artifact.artifactSize,
      manifestJson: artifact.manifestJson,
      chunks: artifact.chunks.map(({ bytes: _bytes, ...chunk }) => chunk),
    });
  }
  const chunkMatch = path.match(/^\/api\/sync\/artifacts\/([a-f0-9]{64})\/chunks\/(\d+)$/);
  if (chunkMatch) {
    const chunk = artifacts.get(chunkMatch[1])?.chunks[Number(chunkMatch[2])];
    return chunk ? new Response(chunk.bytes) : json({ error: "Not found" }, 404);
  }
  if (path === "/api/sync/runs/push" && request.method === "POST") {
    const body = await request.json();
    const replay = receipts.get(body.operationId);
    if (replay) return json({ sequence: replay });
    const sequence = events.length + 1;
    events.push({
      sequence,
      operationId: body.operationId,
      runUid: body.runUid,
      eventKind: body.eventKind,
      payloadJson: body.payloadJson,
      actorClientId,
      createdAt: Date.now(),
    });
    receipts.set(body.operationId, sequence);
    return json({ sequence }, 201);
  }
  if (path === "/api/sync/runs/pull") {
    const after = Number(url.searchParams.get("after") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    return json({
      events: events.filter((event) => event.sequence > after).slice(0, limit),
      currentSequence: events.length,
    });
  }
  return json({ error: "Not found" }, 404);
}

async function createSolution() {
  const solution = join(projectRootA, "solutions", "voidbreaker", "acceptance-run");
  await mkdir(join(solution, "src"), { recursive: true });
  await mkdir(join(solution, "sync-fixture"), { recursive: true });
  await writeFile(join(solution, "src", "main.js"), "export const synchronized = true;\n");
  await writeFile(
    join(solution, "sync-fixture", "package.json"),
    JSON.stringify({ name: "sync-fixture", version: "1.0.0", main: "index.js" }),
  );
  await writeFile(join(solution, "sync-fixture", "index.js"), "module.exports = true;\n");
  await writeFile(
    join(solution, "package.json"),
    JSON.stringify({
      dependencies: { "sync-fixture": "file:./sync-fixture" },
      scripts: {
        build:
          "node -e \"const f=require('fs');f.mkdirSync('dist',{recursive:true});f.writeFileSync('dist/index.html','<!doctype html><title>synced</title>')\"",
        start:
          "node -e \"const h=require('http'),p=Number(process.env.PORT||4173);h.createServer((q,r)=>r.end('synced')).listen(p,'127.0.0.1',()=>console.log('http://127.0.0.1:'+p+'/'))\"",
      },
    }),
  );
  return solution;
}

let launchedSolution;
let stopLaunch;
try {
  const identityA = openLocalStore({ dataRoot: dataRootA });
  const clientIdA = identityA.clientId;
  identityA.close();
  const identityB = openLocalStore({ dataRoot: dataRootB });
  const clientIdB = identityB.clientId;
  identityB.close();
  clients.set(tokenA, clientIdA);
  clients.set(tokenB, clientIdB);

  const solutionPath = await createSolution();
  const historyA = createRunHistoryStore({ dataRoot: dataRootA, projectRoot: projectRootA });
  const scorecardContent = "# Acceptance scorecard\n";
  const runA = historyA.createBenchmarkRun({
    benchmarkId: "voidbreaker",
    benchmarkName: "Voidbreaker",
    solutionPath,
    scoreModel: "acceptance",
    scorecardContent,
    scorecardData: createScorecardData(scorecardContent),
  });
  historyA.close();

  const restartedA = new SyncService({
    dataRoot: dataRootA,
    projectRoot: projectRootA,
    clientId: clientIdA,
    transport: new ConvexHttpSyncTransport({ baseUrl: "https://sync.test", clientToken: tokenA, fetch: mockFetch }),
  });
  const pushed = await restartedA.syncOnce({ force: true });
  if (pushed.pushed !== 1 || pushed.uploaded !== 1 || pushed.errors.length) {
    throw new Error(`Replica A push failed: ${JSON.stringify(pushed)}`);
  }
  if (events[0]?.actorClientId !== clientIdA) throw new Error("Replica A event was attributed to the wrong client");

  const replicaB = new SyncService({
    dataRoot: dataRootB,
    projectRoot: projectRootB,
    clientId: clientIdB,
    transport: new ConvexHttpSyncTransport({ baseUrl: "https://sync.test", clientToken: tokenB, fetch: mockFetch }),
  });
  const pulled = await replicaB.syncOnce({ force: true });
  if (pulled.pulled !== 1 || pulled.downloaded !== 1 || pulled.materialized !== 1 || pulled.errors.length) {
    throw new Error("Replica B pull/materialization failed");
  }

  const historyB = createRunHistoryStore({ dataRoot: dataRootB, projectRoot: projectRootB });
  const runB = historyB.listBenchmarkRuns()[0];
  historyB.close();
  if (!runB || runB.runUid !== runA.runUid) throw new Error("Replica B run mismatch");
  launchedSolution = runB.solutionPath;
  if (!(await readFile(join(runB.solutionPath, "src", "main.js"), "utf8")).includes("synchronized")) {
    throw new Error("Replica B artifact content mismatch");
  }

  process.env.AI_BENCHMARK_DATA_ROOT = dataRootB;
  process.env.AI_BENCHMARK_SYNC_URL = "https://sync.test";
  process.env.AI_BENCHMARK_SYNC_CLIENT_ID = clientIdB;
  process.env.AI_BENCHMARK_SYNC_CLIENT_TOKEN = tokenB;
  const { launchBenchmarkSolution, runBenchmarkScript, stopBenchmarkSolution } = await tsImport(
    "../src/lib/benchmarks.server.ts",
    import.meta.url,
  );
  stopLaunch = stopBenchmarkSolution;
  const launched = await launchBenchmarkSolution("voidbreaker", undefined, runB.id);
  if (!launched.ok || !launched.url) throw new Error(`Direct launch failed after synchronization: ${launched.output}`);
  if (!launched.output.includes("Prepared dependencies with: pnpm install --lockfile=false")) {
    throw new Error("Direct launch did not reconstruct omitted package dependencies");
  }
  const stopped = await stopBenchmarkSolution("voidbreaker", runB.solutionPath);
  if (!stopped.ok) throw new Error(`Unable to stop acceptance launch: ${stopped.output}`);
  launchedSolution = undefined;
  const verified = await runBenchmarkScript("voidbreaker", "verify", undefined, runB.id);
  if (!verified.ok) throw new Error(`Verify failed after synchronization: ${verified.output}`);

  console.log(
    JSON.stringify({
      ok: true,
      offlineRestart: true,
      concreteHttpTransport: true,
      clientIdentityBound: true,
      artifactDigestVerified: true,
      replicaMaterialized: true,
      verifyPassed: true,
      launchPassed: true,
    }),
  );
} finally {
  if (stopLaunch && launchedSolution) {
    await stopLaunch("voidbreaker", launchedSolution).catch(() => undefined);
  }
  delete process.env.AI_BENCHMARK_DATA_ROOT;
  delete process.env.AI_BENCHMARK_SYNC_URL;
  delete process.env.AI_BENCHMARK_SYNC_CLIENT_ID;
  delete process.env.AI_BENCHMARK_SYNC_CLIENT_TOKEN;
  await rm(root, { recursive: true, force: true });
}
