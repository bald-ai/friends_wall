import { v } from "convex/values";
import { mutationGeneric } from "convex/server";
import { getDeviceByExternalId, now } from "./lib";

const mutation = mutationGeneric;

export const heartbeat = mutation({
  args: {
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    const existing = await ctx.db
      .query("presenceStates")
      .withIndex("by_device_id", (q) => q.eq("deviceId", args.deviceId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isOnline: true,
        lastHeartbeatAt: timestamp,
      });
    } else {
      await ctx.db.insert("presenceStates", {
        deviceId: args.deviceId,
        isOnline: true,
        lastHeartbeatAt: timestamp,
      });
    }

    const device = await getDeviceByExternalId(ctx, args.deviceId);
    if (device) {
      await ctx.db.patch(device._id, {
        lastSeenAt: timestamp,
      });
    }

    return { ok: true };
  },
});
