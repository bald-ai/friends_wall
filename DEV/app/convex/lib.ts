/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";

const CODE_TTL_MS = 1000 * 60 * 10;
const HEARTBEAT_WINDOW_MS = 1000 * 25;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type QueryCtx = GenericQueryCtx<any>;
type MutationCtx = GenericMutationCtx<any>;
type Ctx = QueryCtx | MutationCtx;

export function now() {
  return Date.now();
}

export function createPairingCode() {
  return Array.from({ length: 6 }, () =>
    CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join("");
}

export function pairingCodeExpiresAt(createdAt: number) {
  return createdAt + CODE_TTL_MS;
}

export function isExpired(expiresAt: number) {
  return expiresAt <= now();
}

export function isScriptOnline(lastHeartbeatAt?: number) {
  if (!lastHeartbeatAt) {
    return false;
  }

  return now() - lastHeartbeatAt <= HEARTBEAT_WINDOW_MS;
}

export function sortPair(deviceOne: string, deviceTwo: string) {
  return [deviceOne, deviceTwo].sort();
}

export async function getDeviceByToken(ctx: Ctx, deviceToken: string) {
  return ctx.db
    .query("devices")
    .withIndex("by_device_token", (query) =>
      query.eq("deviceToken", deviceToken),
    )
    .unique();
}

export async function listConnectionsForDevice(ctx: Ctx, deviceToken: string) {
  const [asA, asB] = await Promise.all([
    ctx.db
      .query("connections")
      .withIndex("by_device_a", (query) => query.eq("deviceAToken", deviceToken))
      .collect(),
    ctx.db
      .query("connections")
      .withIndex("by_device_b", (query) => query.eq("deviceBToken", deviceToken))
      .collect(),
  ]);

  return [...asA, ...asB];
}

export async function getActiveConnectionForDevice(
  ctx: Ctx,
  deviceToken: string,
) {
  const connections = await listConnectionsForDevice(ctx, deviceToken);
  return connections.find((connection) => connection.status === "active") ?? null;
}

export function getFriendDeviceToken(
  connection: { deviceAToken: string; deviceBToken: string },
  deviceToken: string,
) {
  return connection.deviceAToken === deviceToken
    ? connection.deviceBToken
    : connection.deviceAToken;
}
