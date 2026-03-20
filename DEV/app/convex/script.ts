import { v } from "convex/values";
import { mutationGeneric } from "convex/server";
import { getDeviceByToken, now } from "./lib";

const mutation = mutationGeneric;

export const heartbeat = mutation({
  args: {
    deviceToken: v.string(),
    deviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    const existing = await getDeviceByToken(ctx, args.deviceToken);

    if (existing) {
      await ctx.db.patch(existing._id, {
        deviceName: args.deviceName?.trim() || existing.deviceName,
        lastScriptHeartbeatAt: timestamp,
        updatedAt: timestamp,
      });

      return { ok: true };
    }

    await ctx.db.insert("devices", {
      deviceToken: args.deviceToken,
      deviceName: args.deviceName?.trim() || "This Mac",
      platform: "macos",
      wallpaperControlEnabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastScriptHeartbeatAt: timestamp,
    });

    return { ok: true };
  },
});
