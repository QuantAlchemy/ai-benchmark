import { httpRouter } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { constantTimeEqual, randomClientToken, sha256Hex, sha256HexToBase64 } from "./crypto";
import {
  MAX_ARTIFACT_CHUNKS,
  hashArtifactBlobs,
  parseBearerToken,
  parsePullBounds,
  validateArtifactFinalize,
  validateRunPush,
} from "./protocol";

const http = httpRouter();
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...JSON_HEADERS, "WWW-Authenticate": "Bearer" },
  });
}

async function authenticateRequest(ctx: ActionCtx, request: Request) {
  let token: string;
  try {
    token = parseBearerToken(request.headers.get("Authorization"));
  } catch {
    return null;
  }
  return await ctx.runQuery(internal.auth.authenticateTokenHash, { tokenHash: await sha256Hex(token) });
}

function authenticateAdminRequest(request: Request): boolean {
  let token: string;
  try {
    token = parseBearerToken(request.headers.get("Authorization"));
  } catch {
    return false;
  }
  const expected = process.env.AI_BENCHMARK_ADMIN_TOKEN;
  return typeof expected === "string" && expected.length >= 32 && constantTimeEqual(token, expected);
}

const MAX_JSON_REQUEST_BYTES = 900_000;

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("Expected application/json");
  }
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_REQUEST_BYTES) {
    throw new Error("JSON request exceeds size limit");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_REQUEST_BYTES) {
    throw new Error("JSON request exceeds size limit");
  }
  return JSON.parse(text) as unknown;
}

const statusHandler = httpAction(async (ctx, request) => {
  const client = await authenticateRequest(ctx, request);
  if (!client) return unauthorized();
  const status = await ctx.runQuery(internal.sync.getStatus, { clientDocumentId: client.clientDocumentId });
  return json({ ok: true, currentSequence: status.currentSequence, clientId: client.clientId });
});

http.route({ path: "/api/sync/health", method: "GET", handler: statusHandler });
http.route({ path: "/api/sync/status", method: "GET", handler: statusHandler });

http.route({
  path: "/api/sync/admin/clients",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authenticateAdminRequest(request)) return unauthorized();
    try {
      const body = (await readJson(request)) as {
        clientId: string;
        principalId: string;
        hostId: string;
        installationId: string;
        alias: string;
      };
      const token = randomClientToken();
      await ctx.runMutation(internal.auth.provisionClient, {
        clientId: body.clientId,
        principalId: body.principalId,
        hostId: body.hostId,
        installationId: body.installationId,
        alias: body.alias,
        tokenHash: await sha256Hex(token),
        createdAt: Date.now(),
      });
      return json({ clientId: body.clientId, alias: body.alias, token }, 201);
    } catch {
      return json({ error: "Invalid client provisioning request" }, 400);
    }
  }),
});

http.route({
  path: "/api/sync/admin/clients/revoke",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authenticateAdminRequest(request)) return unauthorized();
    try {
      const body = (await readJson(request)) as { clientId: string };
      const revoked = await ctx.runMutation(internal.auth.revokeClient, {
        clientId: body.clientId,
        revokedAt: Date.now(),
      });
      return revoked ? json({ revoked: true }) : json({ error: "Client not found" }, 404);
    } catch {
      return json({ error: "Invalid client revocation request" }, 400);
    }
  }),
});

http.route({
  path: "/api/sync/artifacts/upload-url",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const client = await authenticateRequest(ctx, request);
    if (!client) return unauthorized();
    try {
      const uploadUrl = await ctx.runMutation(internal.sync.generateUploadUrl, {
        clientDocumentId: client.clientDocumentId,
      });
      return json({ uploadUrl });
    } catch {
      return json({ error: "Unable to generate upload URL" }, 400);
    }
  }),
});

http.route({
  path: "/api/sync/artifacts/finalize",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const client = await authenticateRequest(ctx, request);
    if (!client) return unauthorized();
    try {
      const body = (await readJson(request)) as {
        digest: string;
        sizeBytes: number;
        manifestJson: string;
        chunks: Array<{
          index: number;
          storageId: Id<"_storage">;
          sizeBytes: number;
          sha256: string;
        }>;
      };
      if (!Array.isArray(body.chunks) || body.chunks.length < 1 || body.chunks.length > MAX_ARTIFACT_CHUNKS) {
        throw new Error("Invalid artifact chunks");
      }
      const blobs: Blob[] = [];
      const metadataByStorageId = new Map<string, { size: number; sha256: string }>();
      for (const chunk of body.chunks) {
        if (!chunk || typeof chunk.storageId !== "string" || typeof chunk.sha256 !== "string") {
          throw new Error("Invalid artifact chunk");
        }
        const blob = await ctx.storage.get(chunk.storageId);
        if (!blob) throw new Error("Artifact chunk unavailable");
        blobs.push(blob);
        metadataByStorageId.set(chunk.storageId, { size: blob.size, sha256: chunk.sha256 });
      }
      const validated = validateArtifactFinalize(body, metadataByStorageId);
      const actual = await hashArtifactBlobs(blobs);
      if (
        actual.digest !== validated.digest ||
        actual.chunks.some((chunkDigest, index) => chunkDigest !== validated.chunks[index]?.sha256)
      ) {
        throw new Error("Artifact content digest mismatch");
      }
      const result = await ctx.runMutation(internal.sync.finalizeArtifact, {
        clientDocumentId: client.clientDocumentId,
        digest: validated.digest,
        sizeBytes: validated.sizeBytes,
        manifestJson: validated.manifestJson,
        chunks: validated.chunks.map((chunk) => ({ ...chunk, storageId: chunk.storageId as Id<"_storage"> })),
      });
      return json(result, result.created ? 201 : 200);
    } catch {
      return json({ error: "Invalid artifact finalization" }, 400);
    }
  }),
});

http.route({
  pathPrefix: "/api/sync/artifacts/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const client = await authenticateRequest(ctx, request);
    if (!client) return unauthorized();
    const pathname = new URL(request.url).pathname;
    const metadataMatch = pathname.match(/^\/api\/sync\/artifacts\/([a-f0-9]{64})$/);
    if (metadataMatch) {
      const metadata = await ctx.runQuery(internal.sync.getArtifactMetadata, {
        clientDocumentId: client.clientDocumentId,
        digest: metadataMatch[1]!,
      });
      if (!metadata) return json({ error: "Artifact not found" }, 404);
      return json(metadata);
    }

    const match = pathname.match(
      /^\/api\/sync\/artifacts\/([a-f0-9]{64})\/chunks\/(0|[1-9][0-9]*)$/,
    );
    if (!match) return json({ error: "Artifact chunk not found" }, 404);
    const index = Number(match[2]);
    if (!Number.isSafeInteger(index)) return json({ error: "Artifact chunk not found" }, 404);

    const chunk = await ctx.runQuery(internal.sync.getArtifactChunk, {
      clientDocumentId: client.clientDocumentId,
      digest: match[1]!,
      index,
    });
    if (!chunk) return json({ error: "Artifact chunk not found" }, 404);
    const blob = await ctx.storage.get(chunk.storageId);
    if (!blob || blob.size !== chunk.sizeBytes) return json({ error: "Artifact chunk unavailable" }, 404);
    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Content-Length": String(chunk.sizeBytes),
        Digest: `sha-256=${sha256HexToBase64(chunk.sha256)}`,
        "Cache-Control": "no-store",
      },
    });
  }),
});

http.route({
  path: "/api/sync/runs/push",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const client = await authenticateRequest(ctx, request);
    if (!client) return unauthorized();
    try {
      const operation = validateRunPush(await readJson(request));
      const result = await ctx.runMutation(internal.sync.pushRun, {
        clientDocumentId: client.clientDocumentId,
        operationId: operation.operationId,
        runUid: operation.runUid,
        eventKind: operation.eventKind,
        payloadJson: operation.payloadJson,
        artifactDigest: operation.artifactDigest,
      });
      return json(result, result.duplicate ? 200 : 201);
    } catch {
      return json({ error: "Invalid run operation" }, 400);
    }
  }),
});

http.route({
  path: "/api/sync/runs/pull",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const client = await authenticateRequest(ctx, request);
    if (!client) return unauthorized();
    try {
      const search = new URL(request.url).searchParams;
      const bounds = parsePullBounds(search.get("after"), search.get("limit"));
      return json(
        await ctx.runQuery(internal.sync.pullRuns, {
          clientDocumentId: client.clientDocumentId,
          ...bounds,
        }),
      );
    } catch {
      return json({ error: "Invalid pull request" }, 400);
    }
  }),
});

export default http;
