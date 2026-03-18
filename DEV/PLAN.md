# Friends Wall MVP Implementation Plan

## Product Definition

Friends Wall MVP is a Mac-only product for exactly two people.

Each person owns their own Mac desktop.
Each person can remotely set the other person's wallpaper.

This is not a shared wall.
This is not collaborative editing.
This is not cross-platform.

The MVP proves one thing:

Another person changing your desktop feels meaningful enough to justify the product.

## Locked MVP Decisions

These decisions are currently locked for the first implementation plan.

### Identity model

Use a device-first model.

Each installation of the Mac app creates one local user/device identity for MVP.
No full account system is required in v1.

### Pairing model

Use invite-code pairing.

One person creates a short pairing code.
The other person enters it.
Both sides explicitly accept the connection.

### Consent model

Use one-time mutual consent plus a local kill switch.

After pairing, each person is allowed to set the other person's wallpaper without per-change approval.
Each local app must have an obvious way to pause, disable, or revoke friend control.

### Image input model

Use local file selection plus paste image support.

The sender can:

- choose an image file from disk
- paste an image from the clipboard

Do not support arbitrary URL import in v1.

### Delivery model

Use realtime delivery.

Each local app maintains a live connection to the backend while running.
Wallpaper changes should arrive immediately when the target app is online.

### Presence model

Show whether the friend's Mac app is currently active.

For MVP, "active" means:

- the friend's helper app is online
- the app is connected to the backend
- the app is able to receive wallpaper updates in realtime

This does not have to mean:

- the friend is physically present
- the screen is unlocked
- the human is looking at the computer

If desired later, a stronger signal can be added using system idle detection, but that is not required for v1.

### Device model

Support exactly one Mac device per person.

In MVP, a person is effectively one paired Mac.

### macOS support envelope

Use a strict support envelope.

MVP assumes:

- one display only
- static wallpaper only
- rotating wallpaper/slideshow disabled
- local helper app running
- required system permissions granted

Anything outside that envelope is unsupported in v1.

### Sender experience

Use a simple manual send flow.

The sender picks an image and sends it.
No full editor is included in v1.

## Product Experience

At the highest level, the user experience should feel like this:

1. I install the Mac app.
2. My friend installs the Mac app.
3. We pair once.
4. I can now send an image to their desktop.
5. They can do the same to mine.
6. I can see whether their app is currently active.
7. Either of us can pause or revoke the connection locally.

The product should feel intimate and direct, not like a workflow tool.

## High-level System Architecture

The MVP has four major pieces.

### 1. Mac app

A native Mac app runs locally on each machine.

Responsibilities:

- create or load the local device identity
- display pairing UI
- display friend status
- let the user choose or paste an image
- upload or send wallpaper requests
- hold the live connection to the backend
- receive incoming wallpaper changes
- apply wallpaper locally using native macOS APIs
- expose local pause / disconnect controls

### 2. Backend API

A central backend coordinates identity, pairing, presence, and message delivery.

Responsibilities:

- create device identities
- create and redeem pairing codes
- store pair relationships
- authorize wallpaper-set actions
- track online presence
- relay wallpaper change events
- store metadata for sent wallpapers

### 3. Asset storage

Images need to be stored somewhere accessible to the receiving Mac.

Responsibilities:

- accept uploaded image assets
- return a stored asset reference
- keep asset retrieval simple and reliable

### 4. Realtime channel

A persistent connection is required for immediate delivery and presence.

Responsibilities:

- keep both apps connected
- show whether the friend app is active
- deliver incoming wallpaper-set events immediately

## Recommended Technical Stack

Because Convex is a requirement and speed matters most, the recommended stack is:

- `Convex` for backend data, functions, and realtime presence/delivery
- `Tauri` or native Swift for the Mac client shell
- native macOS `AppKit` APIs for wallpaper application

Current recommendation:

- use `Tauri` for faster app iteration if the desktop shell mostly hosts standard app UI
- use a small native macOS bridge for the wallpaper write operation

Alternative:

- use pure Swift/AppKit if you want the most native Mac integration from day one

For MVP, `Tauri + native wallpaper bridge` is probably the best balance between speed and Mac control.

## Core Domain Model

These are the main objects the system needs.

### LocalDevice

Represents one installed Mac app.

Fields:

- `deviceId`
- `deviceName`
- `createdAt`
- `lastSeenAt`
- `presenceStatus`
- `wallpaperControlEnabled`

### PairInvite

Represents a pending invite code.

Fields:

- `inviteId`
- `code`
- `createdByDeviceId`
- `expiresAt`
- `status`

### PairConnection

Represents the trusted two-person relationship.

Fields:

- `connectionId`
- `deviceAId`
- `deviceBId`
- `status`
- `createdAt`

### WallpaperAsset

Represents an uploaded image to be used as wallpaper.

Fields:

- `assetId`
- `uploadedByDeviceId`
- `storageKey`
- `mimeType`
- `width`
- `height`
- `createdAt`

### WallpaperCommand

Represents the act of telling one device to change wallpaper.

Fields:

- `commandId`
- `fromDeviceId`
- `toDeviceId`
- `assetId`
- `status`
- `createdAt`
- `deliveredAt`
- `appliedAt`
- `failedAt`
- `failureReason`

### PresenceState

Represents whether the friend's app is active.

Fields:

- `deviceId`
- `isOnline`
- `lastHeartbeatAt`

## End-to-end Product Flow

### Flow 1: first launch

1. User opens the Mac app.
2. App creates a local device identity.
3. App requests required local permissions or setup guidance.
4. App shows unpaired state.

### Flow 2: pairing

1. User A creates an invite code.
2. User B enters the code.
3. Backend verifies the code.
4. Both sides see a confirmation prompt.
5. Both accept.
6. Backend creates the pair connection.
7. Both apps move into paired state.

### Flow 3: send wallpaper

1. User A chooses or pastes an image.
2. App uploads the image as an asset.
3. App creates a wallpaper command targeting User B.
4. Backend relays the command to User B's connected app.
5. User B's app downloads the asset if needed.
6. User B's app applies it as wallpaper with native macOS APIs.
7. App reports success or failure back to backend.
8. User A sees the resulting status.

### Flow 4: incoming realtime status

1. User B's app is connected.
2. Backend tracks presence via live connection or heartbeat.
3. User A sees "active" when B's app is online.
4. If B disconnects, presence changes to offline after timeout.

### Flow 5: pause or revoke

1. User opens connection settings.
2. They can either pause incoming remote changes locally or fully unpair.
3. Pause blocks wallpaper application but keeps the relationship.
4. Unpair removes the trusted connection entirely.

## macOS Implementation Plan

The most important local technical responsibility is reliable wallpaper application.

### Wallpaper write path

Use native AppKit as the authoritative path:

- `NSWorkspace.shared.setDesktopImageURL`

Do not rely on AppleScript as the main implementation path.
AppleScript remains useful for diagnostics only.

### Local wallpaper service

Inside the Mac app, create one internal service responsible for wallpaper changes.

Responsibilities:

- validate local image path
- stage the image if necessary
- apply wallpaper through AppKit
- return success/failure
- expose logs for debugging

### Supported local environment

The app should detect and warn if the local environment violates MVP assumptions.

Warnings should cover:

- more than one display
- wallpaper rotation enabled
- unsupported wallpaper mode
- missing permissions

The product does not need to solve all those cases in v1.
It just needs to clearly state whether the system is in a supported state.

## Presence / "Friend is active"

You asked specifically to know if the other person's PC is active if possible.

For MVP, the clean definition is:

Active = the friend's Mac app is online and connected right now.

Implementation:

- local app opens a persistent realtime connection
- backend marks device online while connection is live
- backend expires presence after a short timeout if connection drops
- UI shows `Active now` or `Offline`

Optional later upgrade:

- also collect system idle state from macOS
- distinguish `online`, `idle`, and `offline`

That later upgrade is possible, but it is not required to validate the core MVP.

## Security and trust shape for MVP

This product depends on intimate trust by design.

The MVP security model should be simple and explicit:

- pairing must be intentional
- both sides must accept the relationship
- each side can revoke at any time
- each side can locally pause remote control

The product does not need enterprise-style permission complexity.
It does need clear ownership and clear escape hatches.

## Implementation Phases

### Phase 1: local Mac proof app

Goal:

Prove that a local app can reliably apply wallpapers through a native Mac path.

Deliverables:

- minimal Mac app shell
- local wallpaper service
- environment checks
- manual file-pick and local apply

Success criteria:

- user picks a local image
- app applies it reliably
- app reports success/failure

### Phase 2: pairing and backend foundation

Goal:

Create the smallest backend model for two-device relationships.

Deliverables:

- device registration
- pairing code creation
- pairing code redemption
- pair connection storage

Success criteria:

- two installed apps can become a trusted pair

### Phase 3: realtime presence

Goal:

Show whether the friend app is active.

Deliverables:

- persistent app connection
- backend presence state
- UI showing friend online/offline

Success criteria:

- presence updates within a few seconds

### Phase 4: remote wallpaper send

Goal:

Let one friend change the other friend's wallpaper.

Deliverables:

- image upload flow
- wallpaper command creation
- remote delivery
- local apply on target machine
- delivery status UI

Success criteria:

- sender selects image
- target receives it quickly
- target wallpaper changes
- sender sees success/failure

### Phase 5: pause / disconnect controls

Goal:

Add local safety and trust controls.

Deliverables:

- pause incoming changes
- resume incoming changes
- unpair flow

Success criteria:

- users can stop or revoke remote control clearly

## MVP Out of Scope

These should stay out unless the MVP proves strong demand:

- shared canvas
- stickers, notes, or drawing
- custom HTML desktop widgets
- more than two users
- multiple paired friends
- mobile clients
- Windows support
- Linux support
- desktop-layer live rendering
- scheduling / wallpaper playlists
- feed/history as a polished social product

## Acceptance Criteria

The MVP is successful when all of these are true:

1. Two Macs can be paired intentionally.
2. Each paired user can send an image to the other.
3. The receiving Mac applies the new wallpaper reliably.
4. The sender sees whether the friend app is active.
5. The receiver can pause or revoke control locally.
6. The app behaves clearly inside the supported macOS envelope.

## Risks

### macOS wallpaper behavior

Wallpaper behavior can vary with displays, spaces, and local settings.

Mitigation:

- keep support envelope strict
- use native AppKit path
- detect unsupported local states early

### Presence ambiguity

"Active" can be misunderstood as "the person is at the computer."

Mitigation:

- define active as app-connected in MVP
- word the UI carefully

### Too much product ambition too early

It is easy to drift into collaborative editing, shared walls, or social features.

Mitigation:

- keep v1 centered on remote wallpaper setting only

## Recommended Immediate Next Step

The next planning layer should define the exact user-facing MVP flows in slightly more detail:

- first launch
- create invite code
- redeem invite code
- paired home screen
- send image
- receive image
- pause / unpair

That is the next useful level down because it will turn this plan into a buildable product spec without dropping into low-level implementation yet.
