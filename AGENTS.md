# Friends Wall — Agent Instructions

## Architecture

- **No standalone local wallpaper script.** The Tauri app handles everything — image transfer happens through the web interface, and the Tauri native bridge applies wallpapers locally. There is no separate CLI script or background daemon.
