import { ConvexError, v } from "convex/values";
import { mutationGeneric, queryGeneric } from "convex/server";
import { getActiveConnectionForDevice, getDeviceByToken, getFriendDeviceToken, now } from "./lib";

const mutation = mutationGeneric;
const query = queryGeneric;

export const createUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const queueSend = mutation({
  args: {
    deviceToken: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    const sender = await getDeviceByToken(ctx, args.deviceToken);
    if (!sender) {
      throw new ConvexError("Save this device before sending images.");
    }

    const connection = await getActiveConnectionForDevice(ctx, args.deviceToken);
    if (!connection) {
      throw new ConvexError("Pair with a friend before sending.");
    }

    const targetToken = getFriendDeviceToken(connection, args.deviceToken);
    const target = await getDeviceByToken(ctx, targetToken);
    if (!target) {
      throw new ConvexError("The paired Mac is unavailable.");
    }

    if (!target.wallpaperControlEnabled) {
      throw new ConvexError("Your friend has paused incoming wallpaper changes.");
    }

    const createdAt = now();
    const assetId = await ctx.db.insert("wallpaperAssets", {
      storageId: args.storageId,
      createdByDeviceToken: args.deviceToken,
      fileName: args.fileName,
      mimeType: args.mimeType,
      width: args.width,
      height: args.height,
      createdAt,
    });

    const commandId = await ctx.db.insert("wallpaperCommands", {
      connectionId: connection._id,
      fromDeviceToken: args.deviceToken,
      toDeviceToken: targetToken,
      assetId,
      createdAt,
      status: "pending",
    });

    return { commandId };
  },
});

export const markApplying = mutation({
  args: {
    deviceToken: v.string(),
    commandId: v.id("wallpaperCommands"),
  },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId);
    if (!command || command.toDeviceToken !== args.deviceToken) {
      throw new ConvexError("Wallpaper command not found for this Mac.");
    }

    if (command.status !== "pending") {
      return { ok: true };
    }

    await ctx.db.patch(command._id, {
      status: "applying",
      applyingAt: now(),
    });

    return { ok: true };
  },
});

export const markApplied = mutation({
  args: {
    deviceToken: v.string(),
    commandId: v.id("wallpaperCommands"),
  },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId);
    if (!command || command.toDeviceToken !== args.deviceToken) {
      throw new ConvexError("Wallpaper command not found for this Mac.");
    }

    await ctx.db.patch(command._id, {
      status: "applied",
      appliedAt: now(),
      failureReason: undefined,
      failedAt: undefined,
    });

    return { ok: true };
  },
});

export const markFailed = mutation({
  args: {
    deviceToken: v.string(),
    commandId: v.id("wallpaperCommands"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId);
    if (!command || command.toDeviceToken !== args.deviceToken) {
      throw new ConvexError("Wallpaper command not found for this Mac.");
    }

    await ctx.db.patch(command._id, {
      status: "failed",
      failedAt: now(),
      failureReason: args.reason,
    });

    return { ok: true };
  },
});

export const nextPending = query({
  args: {
    deviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    const device = await getDeviceByToken(ctx, args.deviceToken);
    if (!device || !device.wallpaperControlEnabled) {
      return null;
    }

    const command = await ctx.db
      .query("wallpaperCommands")
      .withIndex("by_to_status", (query) =>
        query.eq("toDeviceToken", args.deviceToken),
      )
      .filter((query) => query.eq(query.field("status"), "pending"))
      .first();

    if (!command) {
      return null;
    }

    const asset = await ctx.db.get(command.assetId);
    if (!asset) {
      return null;
    }

    const assetUrl = await ctx.storage.getUrl(asset.storageId);
    if (!assetUrl) {
      return null;
    }

    return {
      commandId: command._id,
      assetUrl,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
    };
  },
});
