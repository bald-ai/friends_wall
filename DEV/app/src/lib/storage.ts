import type { LocalIdentity } from "../types";

const STORAGE_KEY = "friends-wall/local-identity";

export function createIdentity(deviceName = ""): LocalIdentity {
  return {
    deviceToken: crypto.randomUUID(),
    deviceName,
    platform: "macos",
  };
}

export function loadIdentity(): LocalIdentity | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalIdentity>;
    if (!parsed.deviceToken || parsed.platform !== "macos") {
      return null;
    }

    return {
      deviceToken: parsed.deviceToken,
      deviceName: parsed.deviceName ?? "",
      platform: "macos",
    };
  } catch {
    return null;
  }
}

export function saveIdentity(identity: LocalIdentity) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}
