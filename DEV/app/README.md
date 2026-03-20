# Friends Wall MVP

`DEV/app` is the web + Convex half of the MVP from `DEV/PLAN.md`.

## What is here

- `src/`: single-page React app for identity, pairing, image send, pause, and unpair
- `convex/`: backend functions for devices, pairing codes, uploads, presence, and wallpaper commands
- `../script/`: the separate local macOS listener

## Local setup

```bash
cd DEV/app
pnpm install
cp .env.example .env
```

Set `VITE_CONVEX_URL` in `.env` after you create or connect a Convex deployment.

Then run:

```bash
pnpm run convex:dev
pnpm dev
```

## Production shape

- Frontend: Netlify
- Backend: Convex
- Local listener: run directly on macOS with Node

The app intentionally does not include a Tauri shell or native desktop wrapper.
