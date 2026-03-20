/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError, v } from "convex/values";
import { mutationGeneric, type GenericMutationCtx } from "convex/server";
import {
  createPairingCode,
  getActiveConnectionForDevice,
  getDeviceByToken,
  isExpired,
  now,
  pairingCodeExpiresAt,
  sortPair,
} from "./lib";

const mutation = mutationGeneric;

async function requireDevice(ctx: GenericMutationCtx<any>, deviceToken: string) {
  const device = await getDeviceByToken(ctx, deviceToken);
  if (!device) {
    throw new ConvexError("Save this device in the web app before pairing.");
  }
  return device;
}

export const createCode = mutation({
  args: {
    deviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDevice(ctx, args.deviceToken);

    const activeConnection = await getActiveConnectionForDevice(ctx, args.deviceToken);
    if (activeConnection) {
      throw new ConvexError("This device is already paired.");
    }

    const openCodes = await ctx.db
      .query("pairingCodes")
      .withIndex("by_creator_status", (query) =>
        query.eq("createdByDeviceToken", args.deviceToken),
      )
      .filter((query) => query.eq(query.field("status"), "open"))
      .collect();

    for (const openCode of openCodes) {
      if (isExpired(openCode.expiresAt)) {
        await ctx.db.patch(openCode._id, { status: "expired" });
        continue;
      }

      return {
        codeId: openCode._id,
        code: openCode.code,
        expiresAt: openCode.expiresAt,
      };
    }

    let code = createPairingCode();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const existing = await ctx.db
        .query("pairingCodes")
        .withIndex("by_code", (query) => query.eq("code", code))
        .unique();

      if (!existing || existing.status !== "open" || isExpired(existing.expiresAt)) {
        break;
      }

      code = createPairingCode();
    }

    const createdAt = now();
    const codeId = await ctx.db.insert("pairingCodes", {
      code,
      createdByDeviceToken: args.deviceToken,
      createdAt,
      expiresAt: pairingCodeExpiresAt(createdAt),
      status: "open",
    });

    return {
      codeId,
      code,
      expiresAt: pairingCodeExpiresAt(createdAt),
    };
  },
});

export const redeemCode = mutation({
  args: {
    deviceToken: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDevice(ctx, args.deviceToken);

    const normalizedCode = args.code.trim().toUpperCase();
    const invite = await ctx.db
      .query("pairingCodes")
      .withIndex("by_code", (query) => query.eq("code", normalizedCode))
      .unique();

    if (!invite) {
      throw new ConvexError("That pairing code does not exist.");
    }

    if (invite.createdByDeviceToken === args.deviceToken) {
      throw new ConvexError("You cannot redeem your own code.");
    }

    if (invite.status !== "open" || isExpired(invite.expiresAt)) {
      if (invite.status === "open") {
        await ctx.db.patch(invite._id, { status: "expired" });
      }
      throw new ConvexError("That pairing code has expired.");
    }

    const inviterConnection = await getActiveConnectionForDevice(
      ctx,
      invite.createdByDeviceToken,
    );
    const redeemerConnection = await getActiveConnectionForDevice(ctx, args.deviceToken);

    if (inviterConnection || redeemerConnection) {
      throw new ConvexError("One of these Macs is already paired.");
    }

    const [deviceAToken, deviceBToken] = sortPair(
      invite.createdByDeviceToken,
      args.deviceToken,
    );
    const existingPairs = await ctx.db
      .query("connections")
      .withIndex("by_device_a", (query) => query.eq("deviceAToken", deviceAToken))
      .filter((query) => query.eq(query.field("deviceBToken"), deviceBToken))
      .collect();
    const existingPair =
      existingPairs.sort((left, right) => right.activatedAt - left.activatedAt)[0] ?? null;

    if (existingPair && existingPair.status === "active") {
      throw new ConvexError("These Macs are already paired.");
    }

    const timestamp = now();
    const connectionId = existingPair
      ? existingPair._id
      : await ctx.db.insert("connections", {
          deviceAToken,
          deviceBToken,
          createdAt: timestamp,
          activatedAt: timestamp,
          status: "active",
        });

    if (existingPair) {
      await ctx.db.patch(existingPair._id, {
        activatedAt: timestamp,
        revokedAt: undefined,
        status: "active",
      });
    }

    await ctx.db.patch(invite._id, {
      redeemedByDeviceToken: args.deviceToken,
      connectionId,
      status: "redeemed",
    });

    return { ok: true };
  },
});

export const unpair = mutation({
  args: {
    deviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await getActiveConnectionForDevice(ctx, args.deviceToken);
    if (!connection) {
      throw new ConvexError("This Mac is not paired right now.");
    }

    await ctx.db.patch(connection._id, {
      status: "revoked",
      revokedAt: now(),
    });

    const openCodes = await ctx.db
      .query("pairingCodes")
      .withIndex("by_creator_status", (query) =>
        query.eq("createdByDeviceToken", args.deviceToken),
      )
      .filter((query) => query.eq(query.field("status"), "open"))
      .collect();

    for (const code of openCodes) {
      await ctx.db.patch(code._id, {
        status: "cancelled",
      });
    }

    return { ok: true };
  },
});
