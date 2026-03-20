import { ConvexError, v } from "convex/values";
import { mutationGeneric, type GenericMutationCtx } from "convex/server";
import {
  createInviteCode,
  getDeviceByExternalId,
  getInviteExpiration,
  getLiveConnectionForDevice,
  isInviteExpired,
  listConnectionsForDevice,
  now,
  sortPair,
} from "./lib";

const mutation = mutationGeneric;

async function requireDevice(ctx: GenericMutationCtx<any>, deviceId: string) {
  const device = await getDeviceByExternalId(ctx, deviceId);
  if (!device) {
    throw new ConvexError("Device is not registered yet.");
  }
  return device;
}

export const createInvite = mutation({
  args: {
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDevice(ctx, args.deviceId);
    const activeConnection = await getLiveConnectionForDevice(ctx, args.deviceId);
    if (activeConnection) {
      throw new ConvexError(
        activeConnection.status === "paired"
          ? "This device is already paired."
          : "This device already has a pending connection.",
      );
    }

    const openInvites = await ctx.db
      .query("invites")
      .withIndex("by_creator", (q) => q.eq("createdByDeviceId", args.deviceId))
      .filter((q) => q.eq(q.field("status"), "open"))
      .collect();

    for (const invite of openInvites) {
      if (isInviteExpired(invite.expiresAt)) {
        await ctx.db.patch(invite._id, { status: "expired" });
      } else {
        return invite;
      }
    }

    let code = createInviteCode();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const existing = await ctx.db
        .query("invites")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      if (!existing || existing.status !== "open") {
        break;
      }
      code = createInviteCode();
    }

    const createdAt = now();
    const inviteId = await ctx.db.insert("invites", {
      code,
      createdByDeviceId: args.deviceId,
      createdAt,
      expiresAt: getInviteExpiration(createdAt),
      status: "open",
    });

    return ctx.db.get(inviteId);
  },
});

export const redeemInvite = mutation({
  args: {
    deviceId: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDevice(ctx, args.deviceId);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .unique();

    if (!invite) {
      throw new ConvexError("Invite code not found.");
    }
    if (invite.createdByDeviceId === args.deviceId) {
      throw new ConvexError("You cannot redeem your own invite code.");
    }
    if (invite.status !== "open" || isInviteExpired(invite.expiresAt)) {
      if (invite.status === "open") {
        await ctx.db.patch(invite._id, { status: "expired" });
      }
      throw new ConvexError("Invite code has expired.");
    }

    const inviterConnection = await getLiveConnectionForDevice(
      ctx,
      invite.createdByDeviceId,
    );
    const redeemerConnection = await getLiveConnectionForDevice(ctx, args.deviceId);
    const [deviceAId, deviceBId] = sortPair(invite.createdByDeviceId, args.deviceId);
    const existingConnection = (await listConnectionsForDevice(ctx, deviceAId)).find(
      (connection) =>
        connection.deviceAId === deviceAId &&
        connection.deviceBId === deviceBId &&
        connection.status !== "revoked",
    );

    if (
      (inviterConnection && inviterConnection._id !== existingConnection?._id) ||
      (redeemerConnection && redeemerConnection._id !== existingConnection?._id)
    ) {
      throw new ConvexError("One of these devices already has another live connection.");
    }

    const acceptedByA = deviceAId === invite.createdByDeviceId;
    const acceptedByB = deviceBId === invite.createdByDeviceId;
    let connectionId = existingConnection?._id;

    if (existingConnection) {
      await ctx.db.patch(existingConnection._id, {
        status: "pending",
        acceptedByA,
        acceptedByB,
      });
    } else {
      connectionId = await ctx.db.insert("connections", {
        deviceAId,
        deviceBId,
        acceptedByA,
        acceptedByB,
        createdAt: now(),
        status: "pending",
      });
    }

    await ctx.db.patch(invite._id, {
      redeemedByDeviceId: args.deviceId,
      connectionId,
      status: "redeemed",
    });

    return ctx.db.get(connectionId!);
  },
});

export const acceptConnection = mutation({
  args: {
    deviceId: v.string(),
    connectionId: v.id("connections"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status === "revoked") {
      throw new ConvexError("Connection is no longer available.");
    }
    if (
      connection.deviceAId !== args.deviceId &&
      connection.deviceBId !== args.deviceId
    ) {
      throw new ConvexError("This device is not part of the connection.");
    }

    const patch =
      connection.deviceAId === args.deviceId
        ? { acceptedByA: true }
        : { acceptedByB: true };

    await ctx.db.patch(connection._id, patch);
    const refreshed = await ctx.db.get(connection._id);
    if (!refreshed) {
      throw new ConvexError("Connection disappeared.");
    }

    if (refreshed.acceptedByA && refreshed.acceptedByB) {
      await ctx.db.patch(connection._id, {
        status: "paired",
        pairedAt: now(),
      });
    }

    return ctx.db.get(connection._id);
  },
});

export const setWallpaperControl = mutation({
  args: {
    deviceId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const device = await requireDevice(ctx, args.deviceId);
    await ctx.db.patch(device._id, {
      wallpaperControlEnabled: args.enabled,
      lastSeenAt: now(),
    });
    return { ok: true };
  },
});

export const unpair = mutation({
  args: {
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await getLiveConnectionForDevice(ctx, args.deviceId);
    if (!connection) {
      throw new ConvexError("No active connection to revoke.");
    }

    if (
      connection.deviceAId !== args.deviceId &&
      connection.deviceBId !== args.deviceId
    ) {
      throw new ConvexError("This device cannot revoke that connection.");
    }

    await ctx.db.patch(connection._id, {
      status: "revoked",
      revokedAt: now(),
    });

    const relatedInvites = await Promise.all([
      ctx.db
        .query("invites")
        .withIndex("by_creator", (q) => q.eq("createdByDeviceId", connection.deviceAId))
        .filter((q) => q.eq(q.field("status"), "open"))
        .collect(),
      ctx.db
        .query("invites")
        .withIndex("by_creator", (q) => q.eq("createdByDeviceId", connection.deviceBId))
        .filter((q) => q.eq(q.field("status"), "open"))
        .collect(),
    ]).then(([createdByA, createdByB]) => [...createdByA, ...createdByB]);

    for (const invite of relatedInvites) {
      await ctx.db.patch(invite._id, { status: "cancelled" });
    }

    return { ok: true };
  },
});
