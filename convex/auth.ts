import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const OPAQUE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const authenticateTokenHash = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      clientDocumentId: v.id("clients"),
      clientId: v.string(),
      alias: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("clients")
      .withIndex("by_token_hash", (query) => query.eq("tokenHash", args.tokenHash))
      .unique();
    if (!client || client.revokedAt !== undefined) return null;
    return { clientDocumentId: client._id, clientId: client.clientId, alias: client.alias };
  },
});

export const revokeClient = internalMutation({
  args: {
    clientId: v.string(),
    revokedAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!OPAQUE_UUID.test(args.clientId) || !Number.isFinite(args.revokedAt)) {
      throw new Error("Invalid client revocation fields");
    }
    const client = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (query) => query.eq("clientId", args.clientId))
      .unique();
    if (!client) return false;
    if (client.revokedAt === undefined) await ctx.db.patch("clients", client._id, { revokedAt: args.revokedAt });
    return true;
  },
});

export const provisionClient = internalMutation({
  args: {
    clientId: v.string(),
    principalId: v.string(),
    hostId: v.string(),
    installationId: v.string(),
    alias: v.string(),
    tokenHash: v.string(),
    createdAt: v.number(),
  },
  returns: v.id("clients"),
  handler: async (ctx, args) => {
    if (
      !OPAQUE_UUID.test(args.clientId) ||
      !OPAQUE_UUID.test(args.principalId) ||
      !OPAQUE_UUID.test(args.hostId) ||
      !OPAQUE_UUID.test(args.installationId) ||
      args.alias.trim() !== args.alias ||
      args.alias.length < 1 ||
      args.alias.length > 100 ||
      !/^[a-f0-9]{64}$/.test(args.tokenHash)
    ) {
      throw new Error("Invalid opaque client provisioning fields");
    }
    const [sameClient, sameInstallation, sameToken] = await Promise.all([
      ctx.db.query("clients").withIndex("by_client_id", (query) => query.eq("clientId", args.clientId)).unique(),
      ctx.db
        .query("clients")
        .withIndex("by_installation_id", (query) => query.eq("installationId", args.installationId))
        .unique(),
      ctx.db.query("clients").withIndex("by_token_hash", (query) => query.eq("tokenHash", args.tokenHash)).unique(),
    ]);
    if (sameClient || sameInstallation || sameToken) throw new Error("Client identity already provisioned");
    return await ctx.db.insert("clients", args);
  },
});
