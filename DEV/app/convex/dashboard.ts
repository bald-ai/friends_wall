import { v } from "convex/values";
import { queryGeneric } from "convex/server";
import {
  getActiveConnectionForDevice,
  getDeviceByToken,
  getFriendDeviceToken,
  isExpired,
  isScriptOnline,
} from "./lib";

const query = queryGeneric;

export const get = query({
  args: {
    deviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    const device = await getDeviceByToken(ctx, args.deviceToken);

    const openCodes = await ctx.db
      .query("pairingCodes")
      .withIndex("by_creator_status", (query) =>
        query.eq("createdByDeviceToken", args.deviceToken),
      )
      .filter((query) => query.eq(query.field("status"), "open"))
      .collect();

    let activeCode: {
      codeId: string;
      code: string;
      expiresAt: number;
    } | null = null;

    for (const openCode of openCodes) {
      if (isExpired(openCode.expiresAt)) {
        continue;
      }

      activeCode = {
        codeId: openCode._id,
        code: openCode.code,
        expiresAt: openCode.expiresAt,
      };
      break;
    }

    const connection = await getActiveConnectionForDevice(ctx, args.deviceToken);
    const friendToken = connection
      ? getFriendDeviceToken(connection, args.deviceToken)
      : null;
    const friend = friendToken ? await getDeviceByToken(ctx, friendToken) : null;

    const commandDocs = device && connection
      ? await ctx.db
          .query("wallpaperCommands")
          .withIndex("by_connection", (query) => query.eq("connectionId", connection._id))
          .order("desc")
          .take(8)
      : [];

    const recentCommands = await Promise.all(
      commandDocs.map(async (command) => {
        const asset = await ctx.db.get(command.assetId);
        const previewUrl = asset ? await ctx.storage.getUrl(asset.storageId) : null;
        const sender = await getDeviceByToken(ctx, command.fromDeviceToken);
        const receiver = await getDeviceByToken(ctx, command.toDeviceToken);

        return {
          commandId: command._id,
          status: command.status,
          createdAt: command.createdAt,
          applyingAt: command.applyingAt ?? null,
          appliedAt: command.appliedAt ?? null,
          failedAt: command.failedAt ?? null,
          failureReason: command.failureReason ?? null,
          previewUrl,
          fromDeviceName: sender?.deviceName ?? "Unknown Mac",
          toDeviceName: receiver?.deviceName ?? "Unknown Mac",
          fileName: asset?.fileName ?? "wallpaper",
        };
      }),
    );

    return {
      device: device
        ? {
            deviceToken: device.deviceToken,
            deviceName: device.deviceName,
            wallpaperControlEnabled: device.wallpaperControlEnabled,
            scriptOnline: isScriptOnline(device.lastScriptHeartbeatAt),
            lastScriptHeartbeatAt: device.lastScriptHeartbeatAt ?? null,
          }
        : null,
      activeCode,
      connection:
        connection && friend
          ? {
              connectionId: connection._id,
              friend: {
                deviceToken: friend.deviceToken,
                deviceName: friend.deviceName,
                isOnline: isScriptOnline(friend.lastScriptHeartbeatAt),
                lastHeartbeatAt: friend.lastScriptHeartbeatAt ?? null,
                wallpaperControlEnabled: friend.wallpaperControlEnabled,
              },
            }
          : null,
      recentCommands,
    };
  },
});
