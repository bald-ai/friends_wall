import type { FunctionReference } from "convex/server";
import type {
  CommandSummary,
  DashboardData,
  InviteCodeSummary,
} from "../types";

function queryRef<Args extends Record<string, unknown>, ReturnType>(name: string) {
  return name as unknown as FunctionReference<"query", "public", Args, ReturnType>;
}

function mutationRef<Args extends Record<string, unknown>, ReturnType>(name: string) {
  return name as unknown as FunctionReference<"mutation", "public", Args, ReturnType>;
}

export const convexApi = {
  dashboard: {
    get: queryRef<{ deviceToken: string }, DashboardData>("dashboard:get"),
  },
  devices: {
    ensure: mutationRef<
      {
        deviceToken: string;
        deviceName: string;
        platform: "macos";
      },
      unknown
    >("devices:ensure"),
    setWallpaperControl: mutationRef<
      {
        deviceToken: string;
        enabled: boolean;
      },
      { ok: true }
    >("devices:setWallpaperControl"),
  },
  pairing: {
    createCode: mutationRef<
      {
        deviceToken: string;
      },
      InviteCodeSummary
    >("pairing:createCode"),
    redeemCode: mutationRef<
      {
        deviceToken: string;
        code: string;
      },
      { ok: true }
    >("pairing:redeemCode"),
    unpair: mutationRef<
      {
        deviceToken: string;
      },
      { ok: true }
    >("pairing:unpair"),
  },
  wallpapers: {
    createUploadUrl: mutationRef<Record<string, never>, string>("wallpapers:createUploadUrl"),
    queueSend: mutationRef<
      {
        deviceToken: string;
        storageId: string;
        fileName: string;
        mimeType: string;
        width: number;
        height: number;
      },
      { commandId: string }
    >("wallpapers:queueSend"),
  },
  script: {
    heartbeat: mutationRef<
      {
        deviceToken: string;
        deviceName?: string;
      },
      { ok: true }
    >("script:heartbeat"),
    nextPending: queryRef<
      {
        deviceToken: string;
      },
      {
        commandId: string;
        assetUrl: string;
        fileName: string;
        mimeType: string;
      } | null
    >("wallpapers:nextPending"),
  },
  commandStatus: {
    markApplying: mutationRef<
      {
        deviceToken: string;
        commandId: string;
      },
      { ok: true }
    >("wallpapers:markApplying"),
    markApplied: mutationRef<
      {
        deviceToken: string;
        commandId: string;
      },
      { ok: true }
    >("wallpapers:markApplied"),
    markFailed: mutationRef<
      {
        deviceToken: string;
        commandId: string;
        reason: string;
      },
      { ok: true }
    >("wallpapers:markFailed"),
  },
} as const;

export type DashboardCommand = CommandSummary;
