import { v } from "convex/values";
import { mutationGeneric } from "convex/server";
import { getDeviceByExternalId, now } from "./lib";

const mutation = mutationGeneric;

export const registerDevice = mutation({
  args: {
    deviceId: v.string(),
    deviceName: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await getDeviceByExternalId(ctx, args.deviceId);
    const timestamp = now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        deviceName: args.deviceName,
        lastSeenAt: timestamp,
      });
      return existing._id;
    }

    return ctx.db.insert("devices", {
      deviceId: args.deviceId,
      deviceName: args.deviceName,
      createdAt: timestamp,
      lastSeenAt: timestamp,
      wallpaperControlEnabled: true,
    });
  },
});
