import { v } from "convex/values";
import { queryGeneric } from "convex/server";
import {
  acceptedBySelf,
  friendIdFromConnection,
  getDeviceByExternalId,
  getLiveConnectionForDevice,
  isInviteExpired,
  isPresenceFresh,
} from "./lib";

const query = queryGeneric;

export const getAppState = query({
  args: {
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const device = await getDeviceByExternalId(ctx, args.deviceId);
    const allOpenInvites = await ctx.db
      .query("invites")
      .withIndex("by_creator", (q) => q.eq("createdByDeviceId", args.deviceId))
      .filter((q) => q.eq(q.field("status"), "open"))
      .collect();

    const activeInvite =
      allOpenInvites.find((invite) => !isInviteExpired(invite.expiresAt)) ?? null;

    const connection = await getLiveConnectionForDevice(ctx, args.deviceId);
    const friendDeviceId = connection
      ? friendIdFromConnection(connection, args.deviceId)
      : null;
    const friend = friendDeviceId
      ? await getDeviceByExternalId(ctx, friendDeviceId)
      : null;
    const friendPresenceDoc = friendDeviceId
        ? await ctx.db
          .query("presenceStates")
          .withIndex("by_device_id", (q) => q.eq("deviceId", friendDeviceId))
          .unique()
      : null;

    const commands = device
      ? await Promise.all([
          ctx.db
            .query("wallpaperCommands")
            .withIndex("by_from", (q) => q.eq("fromDeviceId", args.deviceId))
            .order("desc")
            .take(10),
          ctx.db
            .query("wallpaperCommands")
            .withIndex("by_to", (q) => q.eq("toDeviceId", args.deviceId))
            .order("desc")
            .take(10),
        ]).then(([outgoing, incoming]) =>
          [...outgoing, ...incoming].sort((a, b) => b.createdAt - a.createdAt),
        )
      : [];

    const incomingCommands = friend
      ? await ctx.db
          .query("wallpaperCommands")
          .withIndex("by_to", (q) => q.eq("toDeviceId", args.deviceId))
          .filter((q) =>
            q.or(
              q.eq(q.field("status"), "sent"),
              q.eq(q.field("status"), "delivered"),
            ),
          )
          .collect()
      : [];

    const incomingWithAssets = await Promise.all(
      incomingCommands.map(async (command) => {
        const asset = await ctx.db.get(command.assetId);
        if (!asset) {
          return null;
        }

        return {
          ...command,
          assetUrl: await ctx.storage.getUrl(asset.storageId),
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        };
      }),
    );

    const commandSummaries = await Promise.all(
      commands.map(async (command) => {
        const asset = await ctx.db.get(command.assetId);
        return {
          ...command,
          fileName: asset?.fileName ?? "unknown-image",
          mimeType: asset?.mimeType ?? "application/octet-stream",
        };
      }),
    );

    return {
      device,
      activeInvite,
      connection: connection
        ? {
            ...connection,
            acceptedBySelf: acceptedBySelf(connection, args.deviceId),
            friendAccepted: connection.deviceAId === args.deviceId
              ? connection.acceptedByB
              : connection.acceptedByA,
          }
        : null,
      friend: friend
        ? {
            deviceId: friend.deviceId,
            deviceName: friend.deviceName,
            wallpaperControlEnabled: friend.wallpaperControlEnabled,
          }
        : null,
      friendPresence: friendPresenceDoc
        ? {
            isOnline:
              friendPresenceDoc.isOnline &&
              isPresenceFresh(friendPresenceDoc.lastHeartbeatAt),
            lastHeartbeatAt: friendPresenceDoc.lastHeartbeatAt,
          }
        : null,
      incomingCommands: incomingWithAssets.filter(
        (command): command is NonNullable<typeof command> =>
          Boolean(command?.assetUrl),
      ),
      recentCommands: commandSummaries,
    };
  },
});
