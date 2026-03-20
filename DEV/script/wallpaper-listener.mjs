import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";

const convexUrl = requiredEnv("FW_CONVEX_URL");
const deviceToken = requiredEnv("FW_DEVICE_TOKEN");
const deviceName = process.env.FW_DEVICE_NAME?.trim() || "This Mac";
const pollMs = parseInterval(process.env.FW_POLL_MS, 4000);
const heartbeatMs = parseInterval(process.env.FW_HEARTBEAT_MS, 10000);

if (process.platform !== "darwin") {
  throw new Error("The Friends Wall listener only supports macOS.");
}

const client = new ConvexHttpClient(convexUrl, { logger: false });
const tempRoot = path.join(os.tmpdir(), "friends-wall");

let isBusy = false;

async function main() {
  await mkdir(tempRoot, { recursive: true });

  await sendHeartbeat();
  await pollOnce();

  const heartbeatTimer = setInterval(() => {
    void sendHeartbeat();
  }, heartbeatMs);

  const pollTimer = setInterval(() => {
    void pollOnce();
  }, pollMs);

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
      process.exit(0);
    });
  }

  console.log(timestamp(), "listener running");
  console.log(timestamp(), `device=${deviceToken}`);
}

async function sendHeartbeat() {
  await client.mutation("script:heartbeat", {
    deviceToken,
    deviceName,
  });
}

async function pollOnce() {
  if (isBusy) {
    return;
  }

  isBusy = true;

  try {
    const command = await client.query("wallpapers:nextPending", {
      deviceToken,
    });

    if (!command) {
      return;
    }

    console.log(timestamp(), `received ${command.commandId}`);
    await client.mutation("wallpapers:markApplying", {
      deviceToken,
      commandId: command.commandId,
    });

    try {
      const localPath = await downloadAsset(command.assetUrl, command.fileName, command.mimeType);
      applyWallpaper(localPath);

      await client.mutation("wallpapers:markApplied", {
        deviceToken,
        commandId: command.commandId,
      });

      console.log(timestamp(), `applied ${command.commandId}`);
    } catch (error) {
      await client.mutation("wallpapers:markFailed", {
        deviceToken,
        commandId: command.commandId,
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } catch (error) {
    console.error(timestamp(), error instanceof Error ? error.message : String(error));
  } finally {
    isBusy = false;
  }
}

async function downloadAsset(assetUrl, fileName, mimeType) {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(`Asset download failed with status ${response.status}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const extension = extensionFrom(fileName, mimeType);
  const safeName = `${Date.now()}-${sanitizeBaseName(fileName)}${extension}`;
  const outputPath = path.join(tempRoot, safeName);

  await writeFile(outputPath, buffer);
  return outputPath;
}

function applyWallpaper(filePath) {
  const appleScriptPath = filePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = [
    'tell application "System Events"',
    "tell every desktop",
    `set picture to POSIX file "${appleScriptPath}"`,
    "end tell",
    "end tell",
  ].join("\n");

  const result = spawnSync("osascript", ["-e", script], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "osascript failed to set wallpaper.");
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function parseInterval(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeBaseName(fileName) {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .slice(0, 48) || "wallpaper";
}

function extensionFrom(fileName, mimeType) {
  const ext = path.extname(fileName);
  if (ext) {
    return ext;
  }

  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  return ".img";
}

function timestamp() {
  return `[${new Date().toLocaleTimeString()}]`;
}

void main();
