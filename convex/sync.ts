import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  MAX_PULL_LIMIT,
  assertRunPrincipalAuthorization,
  isExactRunPushReplay,
  validateArtifactFinalize,
  validateRunPush,
} from "./protocol";

const artifactChunkValidator = v.object({
  index: v.number(),
  storageId: v.id("_storage"),
  sizeBytes: v.number(),
  sha256: v.string(),
});

const eventValidator = v.object({
  sequence: v.number(),
  operationId: v.string(),
  runUid: v.string(),
  eventKind: v.union(v.literal("snapshot"), v.literal("tombstone")),
  payloadJson: v.string(),
  artifactDigest: v.optional(v.string()),
  actorClientId: v.string(),
  createdAt: v.number(),
});

async function getActiveClient(ctx: QueryCtx | MutationCtx, clientDocumentId: import("./_generated/dataModel").Id<"clients">) {
  const client = await ctx.db.get("clients", clientDocumentId);
  if (!client || client.revokedAt !== undefined) throw new Error("Client is no longer authorized");
  return client;
}

async function authorizeRunWrite(
  ctx: MutationCtx,
  actor: Awaited<ReturnType<typeof getActiveClient>>,
  runUid: string,
  eventKind: "snapshot" | "tombstone",
) {
  const firstEvent = await ctx.db
    .query("syncEvents")
    .withIndex("by_run_uid_and_sequence", (query) => query.eq("runUid", runUid))
    .order("asc")
    .first();
  if (!firstEvent) {
    assertRunPrincipalAuthorization(null, actor.principalId, eventKind);
    return;
  }
  const owner = await ctx.db.get("clients", firstEvent.clientDocumentId);
  if (!owner) throw new Error("Run owner identity is missing");
  assertRunPrincipalAuthorization(owner.principalId, actor.principalId, eventKind);
}

export const getStatus = internalQuery({
  args: { clientDocumentId: v.id("clients") },
  returns: v.object({ currentSequence: v.number() }),
  handler: async (ctx, args) => {
    await getActiveClient(ctx, args.clientDocumentId);
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_scope", (query) => query.eq("scope", "global"))
      .unique();
    return { currentSequence: state?.lastSequence ?? 0 };
  },
});

export const generateUploadUrl = internalMutation({
  args: { clientDocumentId: v.id("clients") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await getActiveClient(ctx, args.clientDocumentId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const finalizeArtifact = internalMutation({
  args: {
    clientDocumentId: v.id("clients"),
    digest: v.string(),
    sizeBytes: v.number(),
    manifestJson: v.string(),
    chunks: v.array(artifactChunkValidator),
  },
  returns: v.object({ digest: v.string(), created: v.boolean() }),
  handler: async (ctx, args) => {
    await getActiveClient(ctx, args.clientDocumentId);
    const storageMetadata = new Map<string, { size: number; sha256: string }>();
    await Promise.all(
      args.chunks.map(async (chunk) => {
        const metadata = await ctx.db.system.get(chunk.storageId);
        if (metadata) storageMetadata.set(chunk.storageId, { size: metadata.size, sha256: metadata.sha256 });
      }),
    );
    const validated = validateArtifactFinalize(
      {
        digest: args.digest,
        sizeBytes: args.sizeBytes,
        manifestJson: args.manifestJson,
        chunks: args.chunks,
      },
      storageMetadata,
    );

    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_digest", (query) => query.eq("digest", validated.digest))
      .unique();
    if (existing) {
      const sameChunks =
        existing.chunks.length === validated.chunks.length &&
        existing.chunks.every((chunk, index) => {
          const claimed = validated.chunks[index]!;
          return chunk.index === claimed.index && chunk.sizeBytes === claimed.sizeBytes && chunk.sha256 === claimed.sha256;
        });
      if (
        existing.sizeBytes !== validated.sizeBytes ||
        existing.manifestJson !== validated.manifestJson ||
        !sameChunks
      ) {
        throw new Error("Artifact digest already exists with different immutable metadata");
      }
      const retainedStorageIds = new Set(existing.chunks.map((chunk) => chunk.storageId));
      await Promise.all(
        args.chunks
          .filter((chunk) => !retainedStorageIds.has(chunk.storageId))
          .map((chunk) => ctx.storage.delete(chunk.storageId)),
      );
      return { digest: existing.digest, created: false };
    }

    await ctx.db.insert("artifacts", {
      digest: validated.digest,
      sizeBytes: validated.sizeBytes,
      manifestJson: validated.manifestJson,
      chunks: args.chunks,
      createdBy: args.clientDocumentId,
      createdAt: Date.now(),
    });
    return { digest: validated.digest, created: true };
  },
});

export const getArtifactMetadata = internalQuery({
  args: {
    clientDocumentId: v.id("clients"),
    digest: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      artifactDigest: v.string(),
      artifactSize: v.number(),
      manifestJson: v.string(),
      chunks: v.array(
        v.object({
          index: v.number(),
          sizeBytes: v.number(),
          sha256: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await getActiveClient(ctx, args.clientDocumentId);
    if (!/^[a-f0-9]{64}$/.test(args.digest)) return null;
    const artifact = await ctx.db
      .query("artifacts")
      .withIndex("by_digest", (query) => query.eq("digest", args.digest))
      .unique();
    if (!artifact) return null;
    return {
      artifactDigest: artifact.digest,
      artifactSize: artifact.sizeBytes,
      manifestJson: artifact.manifestJson,
      chunks: artifact.chunks.map((chunk) => ({
        index: chunk.index,
        sizeBytes: chunk.sizeBytes,
        sha256: chunk.sha256,
      })),
    };
  },
});

export const getArtifactChunk = internalQuery({
  args: {
    clientDocumentId: v.id("clients"),
    digest: v.string(),
    index: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({
      storageId: v.id("_storage"),
      sizeBytes: v.number(),
      sha256: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await getActiveClient(ctx, args.clientDocumentId);
    if (!/^[a-f0-9]{64}$/.test(args.digest) || !Number.isSafeInteger(args.index) || args.index < 0) return null;
    const artifact = await ctx.db
      .query("artifacts")
      .withIndex("by_digest", (query) => query.eq("digest", args.digest))
      .unique();
    const chunk = artifact?.chunks[args.index];
    if (!chunk || chunk.index !== args.index) return null;
    return { storageId: chunk.storageId, sizeBytes: chunk.sizeBytes, sha256: chunk.sha256 };
  },
});

export const pushRun = internalMutation({
  args: {
    clientDocumentId: v.id("clients"),
    operationId: v.string(),
    runUid: v.string(),
    eventKind: v.union(v.literal("snapshot"), v.literal("tombstone")),
    payloadJson: v.string(),
    artifactDigest: v.optional(v.string()),
  },
  returns: v.object({ sequence: v.number(), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await getActiveClient(ctx, args.clientDocumentId);
    const operation = validateRunPush({
      operationId: args.operationId,
      runUid: args.runUid,
      eventKind: args.eventKind,
      payloadJson: args.payloadJson,
      artifactDigest: args.artifactDigest,
    });
    await authorizeRunWrite(ctx, actor, operation.runUid, operation.eventKind);
    const existing = await ctx.db
      .query("syncEvents")
      .withIndex("by_operation_id", (query) => query.eq("operationId", operation.operationId))
      .unique();
    if (existing) {
      if (
        !isExactRunPushReplay(
          {
            clientDocumentId: existing.clientDocumentId,
            runUid: existing.runUid,
            eventKind: existing.eventKind,
            payloadJson: existing.payloadJson,
            artifactDigest: existing.artifactDigest,
          },
          {
            clientDocumentId: args.clientDocumentId,
            runUid: operation.runUid,
            eventKind: operation.eventKind,
            payloadJson: operation.payloadJson,
            artifactDigest: operation.artifactDigest,
          },
        )
      ) {
        throw new Error("Operation ID was already used for different content");
      }
      return { sequence: existing.sequence, duplicate: true };
    }

    if (operation.artifactDigest !== undefined) {
      const artifact = await ctx.db
        .query("artifacts")
        .withIndex("by_digest", (query) => query.eq("digest", operation.artifactDigest!))
        .unique();
      if (!artifact) throw new Error("Referenced artifact does not exist");
    }

    const state = await ctx.db
      .query("syncState")
      .withIndex("by_scope", (query) => query.eq("scope", "global"))
      .unique();
    const sequence = (state?.lastSequence ?? 0) + 1;
    if (!Number.isSafeInteger(sequence)) throw new Error("Sync sequence exhausted");
    if (state) await ctx.db.patch("syncState", state._id, { lastSequence: sequence });
    else await ctx.db.insert("syncState", { scope: "global", lastSequence: sequence });

    await ctx.db.insert("syncEvents", {
      sequence,
      operationId: operation.operationId,
      clientDocumentId: args.clientDocumentId,
      runUid: operation.runUid,
      eventKind: operation.eventKind,
      payloadJson: operation.payloadJson,
      ...(operation.artifactDigest === undefined ? {} : { artifactDigest: operation.artifactDigest }),
      createdAt: Date.now(),
    });
    return { sequence, duplicate: false };
  },
});

export const pullRuns = internalQuery({
  args: {
    clientDocumentId: v.id("clients"),
    after: v.number(),
    limit: v.number(),
  },
  returns: v.object({
    events: v.array(eventValidator),
    nextAfter: v.number(),
    currentSequence: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await getActiveClient(ctx, args.clientDocumentId);
    if (
      !Number.isSafeInteger(args.after) ||
      args.after < 0 ||
      !Number.isSafeInteger(args.limit) ||
      args.limit < 1 ||
      args.limit > MAX_PULL_LIMIT
    ) {
      throw new Error("Invalid pull bounds");
    }
    const [rows, state] = await Promise.all([
      ctx.db
        .query("syncEvents")
        .withIndex("by_sequence", (query) => query.gt("sequence", args.after))
        .order("asc")
        .take(args.limit + 1),
      ctx.db.query("syncState").withIndex("by_scope", (query) => query.eq("scope", "global")).unique(),
    ]);
    const hasMore = rows.length > args.limit;
    const page = hasMore ? rows.slice(0, args.limit) : rows;
    const events = await Promise.all(
      page.map(async (event) => {
        const actor = await ctx.db.get("clients", event.clientDocumentId);
        if (!actor) throw new Error("Sync event actor is missing");
        return {
          sequence: event.sequence,
          operationId: event.operationId,
          runUid: event.runUid,
          eventKind: event.eventKind,
          payloadJson: event.payloadJson,
          ...(event.artifactDigest === undefined ? {} : { artifactDigest: event.artifactDigest }),
          actorClientId: actor.clientId,
          createdAt: event.createdAt,
        };
      }),
    );
    return {
      events,
      nextAfter: events.at(-1)?.sequence ?? args.after,
      currentSequence: state?.lastSequence ?? 0,
      hasMore,
    };
  },
});
