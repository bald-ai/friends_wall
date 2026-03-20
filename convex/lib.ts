import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";

const INVITE_TTL_MS = 1000 * 60 * 10;
const PRESENCE_WINDOW_MS = 1000 * 20;

export function now() {
  return Date.now();
}

type QueryCtx = GenericQueryCtx<any>;
type MutationCtx = GenericMutationCtx<any>;

export function getInviteExpiration(createdAt: number) {
  return createdAt + INVITE_TTL_MS;
}

export function isInviteExpired(expiresAt: number) {
  return expiresAt <= now();
}

export function sortPair(deviceOneId: string, deviceTwoId: string) {
  return [deviceOneId, deviceTwoId].sort();
}

export function createInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

export async function getDeviceByExternalId(
  ctx: QueryCtx | MutationCtx,
  deviceId: string,
) {
  return ctx.db
    .query("devices")
    .withIndex("by_device_id", (q) => q.eq("deviceId", deviceId))
    .unique();
}

export async function listConnectionsForDevice(
  ctx: QueryCtx | MutationCtx,
  deviceId: string,
) {
  const [asA, asB] = await Promise.all([
    ctx.db
      .query("connections")
      .withIndex("by_device_a", (q) => q.eq("deviceAId", deviceId))
      .collect(),
    ctx.db
      .query("connections")
      .withIndex("by_device_b", (q) => q.eq("deviceBId", deviceId))
      .collect(),
  ]);

  return [...asA, ...asB];
}

export async function getLiveConnectionForDevice(
  ctx: QueryCtx | MutationCtx,
  deviceId: string,
) {
  const connections = await listConnectionsForDevice(ctx, deviceId);

  return (
    connections.find((connection) => connection.status === "paired") ??
    connections.find((connection) => connection.status === "pending") ??
    null
  );
}

export function friendIdFromConnection(
  connection: { deviceAId: string; deviceBId: string },
  deviceId: string,
) {
  return connection.deviceAId === deviceId
    ? connection.deviceBId
    : connection.deviceAId;
}

export function acceptedBySelf(
  connection: {
    deviceAId: string;
    acceptedByA: boolean;
    acceptedByB: boolean;
  },
  deviceId: string,
) {
  return connection.deviceAId === deviceId
    ? connection.acceptedByA
    : connection.acceptedByB;
}

export function isPresenceFresh(lastHeartbeatAt: number) {
  return now() - lastHeartbeatAt <= PRESENCE_WINDOW_MS;
}
