#!/bin/zsh

set -euo pipefail

DEFAULT_IMAGE="/Users/michalkrsik/Desktop/wp_test/RED.png"
IMAGE_PATH="${1:-$DEFAULT_IMAGE}"
STORE_PLIST="$HOME/Library/Application Support/com.apple.wallpaper/Store/Index.plist"

if [[ ! -f "$IMAGE_PATH" ]]; then
  echo "Image not found: $IMAGE_PATH" >&2
  exit 1
fi

if [[ ! -f "$STORE_PLIST" ]]; then
  echo "Wallpaper store not found: $STORE_PLIST" >&2
  exit 1
fi

/usr/bin/python3 - "$IMAGE_PATH" "$STORE_PLIST" <<'PY'
import plistlib
import sys
from pathlib import Path

image_path = Path(sys.argv[1]).expanduser().resolve()
store_path = Path(sys.argv[2]).expanduser()

with store_path.open("rb") as f:
    store = plistlib.load(f)

image_url = f"file://{image_path.as_posix()}"

def make_config():
    return plistlib.dumps(
        {
            "type": "imageFile",
            "url": {"relative": image_url},
        },
        fmt=plistlib.FMT_BINARY,
    )

new_config = make_config()

def rewrite_desktop(node):
    if not isinstance(node, dict):
        return 0

    changed = 0
    desktop = node.get("Desktop")
    if isinstance(desktop, dict):
        content = desktop.get("Content")
        if isinstance(content, dict):
            content["Choices"] = [
                {
                    "Configuration": new_config,
                    "Files": [],
                    "Provider": "com.apple.wallpaper.choice.image",
                }
            ]
            content["Shuffle"] = "$null"
            changed += 1

    for value in node.values():
        if isinstance(value, dict):
            changed += rewrite_desktop(value)
    return changed

changed_count = rewrite_desktop(store)

with store_path.open("wb") as f:
    plistlib.dump(store, f, fmt=plistlib.FMT_BINARY)

print(f"{image_path} | updated desktop entries: {changed_count}")
PY

/usr/bin/killall WallpaperAgent >/dev/null 2>&1 || true
/usr/bin/killall Dock >/dev/null 2>&1 || true
/bin/sleep 2
/usr/bin/osascript -e 'tell application "Finder" to get POSIX path of (desktop picture as alias)'
