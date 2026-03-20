import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  devices: defineTable({
    deviceToken: v.string(),
    deviceName: v.string(),
    platform: v.literal("macos"),
    wallpaperControlEnabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastScriptHeartbeatAt: v.optional(v.number()),
  }).index("by_device_token", ["deviceToken"]),

  pairingCodes: defineTable({
    code: v.string(),
    createdByDeviceToken: v.string(),
    redeemedByDeviceToken: v.optional(v.string()),
    connectionId: v.optional(v.id("connections")),
    createdAt: v.number(),
    expiresAt: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("redeemed"),
      v.literal("expired"),
      v.literal("cancelled"),
    ),
  })
    .index("by_code", ["code"])
    .index("by_creator_status", ["createdByDeviceToken", "status"]),

  connections: defineTable({
    deviceAToken: v.string(),
    deviceBToken: v.string(),
    createdAt: v.number(),
    activatedAt: v.number(),
    revokedAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("revoked")),
  })
    .index("by_pair", ["deviceAToken", "deviceBToken"])
    .index("by_device_a", ["deviceAToken"])
    .index("by_device_b", ["deviceBToken"]),

  wallpaperAssets: defineTable({
    storageId: v.id("_storage"),
    createdByDeviceToken: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    width: v.number(),
    height: v.number(),
    createdAt: v.number(),
  }).index("by_creator", ["createdByDeviceToken"]),

  wallpaperCommands: defineTable({
    connectionId: v.id("connections"),
    fromDeviceToken: v.string(),
    toDeviceToken: v.string(),
    assetId: v.id("wallpaperAssets"),
    createdAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("applying"),
      v.literal("applied"),
      v.literal("failed"),
    ),
    applyingAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
  })
    .index("by_to_status", ["toDeviceToken", "status"])
    .index("by_to", ["toDeviceToken"])
    .index("by_connection", ["connectionId"]),
});
