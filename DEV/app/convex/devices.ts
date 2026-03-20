import { ConvexError, v } from "convex/values";
import { mutationGeneric } from "convex/server";
import { getDeviceByToken, now } from "./lib";

const mutation = mutationGeneric;

export const ensure = mutation({
  args: {
    deviceToken: v.string(),
    deviceName: v.string(),
    platform: v.literal("macos"),
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    const existing = await getDeviceByToken(ctx, args.deviceToken);

    if (existing) {
      await ctx.db.patch(existing._id, {
        deviceName: args.deviceName,
        platform: args.platform,
        updatedAt: timestamp,
      });

      return ctx.db.get(existing._id);
    }

    const createdId = await ctx.db.insert("devices", {
      deviceToken: args.deviceToken,
      deviceName: args.deviceName,
      platform: args.platform,
      wallpaperControlEnabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return ctx.db.get(createdId);
  },
});

export const setWallpaperControl = mutation({
  args: {
    deviceToken: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const device = await getDeviceByToken(ctx, args.deviceToken);
    if (!device) {
      throw new ConvexError("Device not found.");
    }

    await ctx.db.patch(device._id, {
      wallpaperControlEnabled: args.enabled,
      updatedAt: now(),
    });

    return { ok: true };
  },
});
