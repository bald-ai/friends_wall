import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  devices: defineTable({
    deviceId: v.string(),
    deviceName: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    wallpaperControlEnabled: v.boolean(),
  }).index("by_device_id", ["deviceId"]),

  invites: defineTable({
    code: v.string(),
    createdByDeviceId: v.string(),
    redeemedByDeviceId: v.optional(v.string()),
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
    .index("by_creator", ["createdByDeviceId"])
    .index("by_creator_status", ["createdByDeviceId", "status"]),

  connections: defineTable({
    deviceAId: v.string(),
    deviceBId: v.string(),
    acceptedByA: v.boolean(),
    acceptedByB: v.boolean(),
    createdAt: v.number(),
    pairedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("paired"),
      v.literal("revoked"),
    ),
  })
    .index("by_pair", ["deviceAId", "deviceBId"])
    .index("by_device_a", ["deviceAId"])
    .index("by_device_b", ["deviceBId"]),

  presenceStates: defineTable({
    deviceId: v.string(),
    isOnline: v.boolean(),
    lastHeartbeatAt: v.number(),
  }).index("by_device_id", ["deviceId"]),

  wallpaperAssets: defineTable({
    uploadedByDeviceId: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    width: v.number(),
    height: v.number(),
    createdAt: v.number(),
  }).index("by_uploaded_by", ["uploadedByDeviceId"]),

  wallpaperCommands: defineTable({
    fromDeviceId: v.string(),
    toDeviceId: v.string(),
    assetId: v.id("wallpaperAssets"),
    createdAt: v.number(),
    deliveredAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("applied"),
      v.literal("failed"),
    ),
  })
    .index("by_from", ["fromDeviceId"])
    .index("by_to", ["toDeviceId"])
    .index("by_to_status", ["toDeviceId", "status"]),
});
