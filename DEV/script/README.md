# Friends Wall Listener

This is the tiny local macOS listener for the MVP.

It does three things:

1. Heartbeats to Convex so the friend appears online.
2. Polls for the next pending wallpaper command.
3. Downloads the image and applies it with `osascript`.

## Setup

```bash
cd DEV/script
npm install
FW_CONVEX_URL="https://your-deployment.convex.cloud" \
FW_DEVICE_TOKEN="your-device-token-from-the-web-app" \
FW_DEVICE_NAME="This Mac" \
node wallpaper-listener.mjs
```

Optional env vars:

- `FW_POLL_MS` defaults to `4000`
- `FW_HEARTBEAT_MS` defaults to `10000`

The script only supports macOS.
