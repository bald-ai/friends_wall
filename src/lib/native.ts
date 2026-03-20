import { invoke } from "@tauri-apps/api/core";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export type EnvironmentReport = {
  platform: string;
  supported: boolean;
  screenCount: number;
  currentWallpaperPath: string | null;
  warnings: string[];
};

export type WallpaperApplyResult = {
  localPath: string;
  appliedScreenCount: number;
};

export function hasTauriRuntime() {
  return Boolean(window.__TAURI_INTERNALS__);
}

export async function inspectEnvironment() {
  if (!hasTauriRuntime()) {
    return {
      platform: "web",
      supported: false,
      screenCount: 0,
      currentWallpaperPath: null,
      warnings: [
        "Wallpaper application only works in the macOS Tauri app.",
      ],
    } satisfies EnvironmentReport;
  }

  return invoke<EnvironmentReport>("inspect_environment");
}

export async function applyWallpaperFromUrl(sourceUrl: string, fileName: string) {
  if (!hasTauriRuntime()) {
    throw new Error("Wallpaper application requires the Tauri macOS app.");
  }

  return invoke<WallpaperApplyResult>("apply_wallpaper_from_url", {
    sourceUrl,
    fileName,
  });
}
