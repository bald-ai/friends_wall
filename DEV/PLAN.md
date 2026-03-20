# Friends Wall MVP Plan

## Why this exists

Social media is the default way to stay connected with friends, but half the time you hate going there — notifications, ads, algorithmic noise. This project explores a different idea: what if your desktop itself was a quiet, direct channel between you and a friend?

No feed. No app to open. Just your wallpaper changing because someone you care about sent you something.

This MVP is testing two things:

1. **Technically** — can we make this work simply and reliably?
2. **Emotionally** — is this interaction actually fun in its simplest form?

If it's not fun with just wallpapers, no amount of features will save it. If it is fun, there's something worth building on.

## What it is

You change your friend's Mac wallpaper. They change yours.
That's the whole product. The MVP proves whether this interaction feels fun and meaningful.

## Three pieces

### 1. Simple web page

A single-page web app. Nothing fancy.

- Create or enter a pairing code to connect with your friend
- See if your friend is online
- Drag and drop an image to send it to their desktop
- Pause incoming wallpaper changes or unpair

### 2. Convex backend

One backend handles everything:

- Device identity (no accounts, no login — just a device ID)
- Pairing codes (create, redeem, establish connection)
- Image storage
- Realtime presence (friend online/offline)
- Realtime wallpaper delivery

### 3. Local Mac wallpaper script

A tiny script running on each Mac:

- Connects to Convex and watches for new wallpaper commands
- Downloads the image
- Applies it as wallpaper (via native macOS API or osascript)
- Reports heartbeat so presence works

This is ~20-30 lines of code. Not an app.

## User flow

1. Both people open the web page
2. One person creates a pairing code
3. The other person enters it — they're now connected
4. Both run the local wallpaper script on their Mac
5. Drag an image onto the web page → friend's desktop wallpaper changes
6. Either person can pause incoming changes or unpair

## Presence

"Online" means the friend's local wallpaper script is running and connected.
Nothing more. Not "person is at computer." Just "their script is alive."

## Pairing

- One person clicks "create code" → gets a short code
- Other person enters the code → connection established
- Both must be identified (device ID) before pairing
- Either side can unpair at any time

## What's NOT in this MVP

- No Tauri or native app shell
- No account system or login
- No image editor or filters
- No multi-display support
- No mobile or Windows
- No shared canvas or collaborative features
- No wallpaper history or feed
- No scheduling or playlists

## Tech stack

- **Frontend:** Simple React web page (Vite)
- **Backend:** Convex (data, functions, file storage, realtime)
- **Hosting:** Netlify
- **Local script:** Node.js or Swift CLI — whatever is simplest to set wallpaper on macOS

## Setup note

Convex API keys, Netlify deployment, and any other credentials/config will be handled manually by the developer at the end — not during development. Build everything first, plug in the keys later.
