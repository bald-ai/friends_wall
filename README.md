# Friends Wall

Mac-first shared wall project.

## Goal

Build a web-based shared wall for close friends, then connect it to a real macOS desktop experience.

The desktop part is no longer theoretical. We verified on this machine that macOS desktop wallpaper is code-controllable.

## What We Verified

We tested multiple ways to read and change the desktop picture on this Mac.

### Read current wallpaper

AppleScript works for reading:

```sh
osascript -e 'tell application "System Events" to get picture of current desktop'
```

Finder also reports the current desktop picture:

```sh
osascript -e 'tell application "Finder" to get POSIX path of (desktop picture as alias)'
```

### Set wallpaper from code

AppleScript can request a wallpaper change:

```sh
osascript -e 'tell application "System Events" to tell every desktop to set picture to POSIX file "/absolute/path/to/image.jpg"'
```

On this machine, that changed system wallpaper state, but it was not always the most reliable way to get the visible desktop to match immediately.

The more reliable path was native AppKit:

```swift
import AppKit

let url = URL(fileURLWithPath: "/absolute/path/to/image.jpg")

for screen in NSScreen.screens {
    try NSWorkspace.shared.setDesktopImageURL(url, for: screen, options: [:])
}
```

We ran this successfully from the shell with `swift -e`.

### Dedicated wallpaper CLI

We also installed and used the `wallpaper` CLI via Homebrew:

```sh
brew install wallpaper
wallpaper get
wallpaper set "/absolute/path/to/image.jpg" --screen main --scale fit --fill-color 000000
```

This was useful for checking current system wallpaper state.

## Concrete Result

We successfully set the wallpaper to:

[`/Users/michalkrsik/Desktop/Earl.jpg`](/Users/michalkrsik/windsurf_project_folder/friends_wall/../Desktop/Earl.jpg)

Confirmed by:

```sh
wallpaper get
```

and:

```sh
osascript -e 'tell application "Finder" to get POSIX path of (desktop picture as alias)'
```

Both reported:

```text
/Users/michalkrsik/Desktop/Earl.jpg
```

## What We Learned

1. macOS wallpaper is definitely controllable from code.
2. AppleScript can work, but native AppKit is more trustworthy.
3. A tiny local Mac helper app can absolutely update the desktop image on demand.
4. That means a Mac-only prototype can be built without solving every operating system first.

## Practical Product Direction

For a Mac-first prototype, there are two viable paths:

### Path 1: image-based desktop updates

The web app renders the current shared wall to an image.
The local Mac helper app downloads or reads that image.
The helper app sets it as wallpaper with AppKit.

This is the simplest real desktop prototype.

### Path 2: live desktop layer

Instead of swapping a wallpaper image, build a native macOS app that renders live web content at the desktop layer.

This is closer to the long-term product vision, but it is more complex than the image-swap approach.

## Recommended Starting Point

Start with Path 1 first.

Why:

- smallest technical surface
- already proven possible on this machine
- enough to validate the core feeling: friend changes wall, your desktop changes

If that experience feels compelling, then move to the live desktop-layer version.

## Repo Status

This repository was initialized on March 18, 2026 as the starting point for the Mac-first Friends Wall project.
