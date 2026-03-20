import { ConvexError, v } from "convex/values";
import { mutationGeneric, type GenericMutationCtx } from "convex/server";
import { friendIdFromConnection, getDeviceByExternalId, getLiveConnectionForDevice, now } from "./lib";

const mutation = mutationGeneric;

async function requireSendAccess(ctx: GenericMutationCtx<any>, deviceId: string) {
  const sender = await getDeviceByExternalId(ctx, deviceId);
  if (!sender) {
    throw new ConvexError("Register this device before sending wallpapers.");
  }

  const connection = await getLiveConnectionForDevice(ctx, deviceId);
  if (!connection || connection.status !== "paired") {
    throw new ConvexError("Pair with a friend before sending wallpapers.");
  }

  const targetDeviceId = friendIdFromConnection(connection, deviceId);
  const target = await getDeviceByExternalId(ctx, targetDeviceId);
  if (!target) {
    throw new ConvexError("Friend device is unavailable.");
  }
  if (!target.wallpaperControlEnabled) {
    throw new ConvexError("Your friend has paused remote wallpaper changes.");
  }

  return {
    sender,
    target,
    targetDeviceId,
  };
}

export const createUploadUrl = mutation({
  args: {
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSendAccess(ctx, args.deviceId);
    return ctx.storage.generateUploadUrl();
  },
});

export const sendWallpaper = mutation({
  args: {
    fromDeviceId: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    const { targetDeviceId } = await requireSendAccess(ctx, args.fromDeviceId);

    const createdAt = now();
    const assetId = await ctx.db.insert("wallpaperAssets", {
      uploadedByDeviceId: args.fromDeviceId,
      storageId: args.storageId,
      storageKey: `${args.fromDeviceId}/${createdAt}-${args.fileName}`,
      fileName: args.fileName,
      mimeType: args.mimeType,
      width: args.width,
      height: args.height,
      createdAt,
    });

    return ctx.db.insert("wallpaperCommands", {
      fromDeviceId: args.fromDeviceId,
      toDeviceId: targetDeviceId,
      assetId,
      createdAt,
      status: "sent",
    });
  },
});

export const markDelivered = mutation({
  args: {
    deviceId: v.string(),
    commandId: v.id("wallpaperCommands"),
  },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId);
    if (!command || command.toDeviceId !== args.deviceId) {
      throw new ConvexError("Command is not available for this device.");
    }
    if (command.status === "sent") {
      await ctx.db.patch(command._id, {
        status: "delivered",
        deliveredAt: now(),
      });
    }
    return { ok: true };
  },
});

export const markApplied = mutation({
  args: {
    deviceId: v.string(),
    commandId: v.id("wallpaperCommands"),
  },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId);
    if (!command || command.toDeviceId !== args.deviceId) {
      throw new ConvexError("Command is not available for this device.");
    }
    await ctx.db.patch(command._id, {
      status: "applied",
      appliedAt: now(),
    });
    return { ok: true };
  },
});

export const markFailed = mutation({
  args: {
    deviceId: v.string(),
    commandId: v.id("wallpaperCommands"),
    failureReason: v.string(),
  },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId);
    if (!command || command.toDeviceId !== args.deviceId) {
      throw new ConvexError("Command is not available for this device.");
    }
    await ctx.db.patch(command._id, {
      status: "failed",
      failedAt: now(),
      failureReason: args.failureReason,
    });
    return { ok: true };
  },
});
