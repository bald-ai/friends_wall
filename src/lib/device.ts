const STORAGE_KEY = "friends-wall/device/v1";

export type LocalDevice = {
  deviceId: string;
  deviceName: string;
};

export function loadLocalDevice() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as LocalDevice;
  } catch {
    return null;
  }
}

export function createAnonymousDevice() {
  return {
    deviceId: crypto.randomUUID(),
    deviceName: "",
  } satisfies LocalDevice;
}

export function saveLocalDevice(device: LocalDevice) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(device));
}
