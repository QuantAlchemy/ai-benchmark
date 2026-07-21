import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const artifactChunk = v.object({
  index: v.number(),
  storageId: v.id("_storage"),
  sizeBytes: v.number(),
  sha256: v.string(),
});

export default defineSchema({
  clients: defineTable({
    clientId: v.string(),
    principalId: v.string(),
    hostId: v.string(),
    installationId: v.string(),
    tokenHash: v.string(),
    alias: v.string(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_client_id", ["clientId"])
    .index("by_installation_id", ["installationId"])
    .index("by_token_hash", ["tokenHash"]),

  syncEvents: defineTable({
    sequence: v.number(),
    operationId: v.string(),
    clientDocumentId: v.id("clients"),
    runUid: v.string(),
    eventKind: v.union(v.literal("snapshot"), v.literal("tombstone")),
    payloadJson: v.string(),
    artifactDigest: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_operation_id", ["operationId"])
    .index("by_run_uid_and_sequence", ["runUid", "sequence"])
    .index("by_sequence", ["sequence"]),

  syncState: defineTable({
    scope: v.literal("global"),
    lastSequence: v.number(),
  }).index("by_scope", ["scope"]),

  artifacts: defineTable({
    digest: v.string(),
    sizeBytes: v.number(),
    manifestJson: v.string(),
    chunks: v.array(artifactChunk),
    createdBy: v.id("clients"),
    createdAt: v.number(),
  }).index("by_digest", ["digest"]),
});
