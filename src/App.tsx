import {
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "./lib/convexApi";
import { createAnonymousDevice, loadLocalDevice, saveLocalDevice } from "./lib/device";
import {
  applyWallpaperFromUrl,
  inspectEnvironment,
  type EnvironmentReport,
} from "./lib/native";
import type { AppState, IncomingCommand } from "./lib/types";

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatStatusDate(timestamp?: number) {
  if (!timestamp) {
    return "Just now";
  }

  const seconds = Math.round((timestamp - Date.now()) / 1000);
  if (Math.abs(seconds) < 60) {
    return relativeTime.format(seconds, "second");
  }

  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) {
    return relativeTime.format(minutes, "minute");
  }

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return relativeTime.format(hours, "hour");
  }

  const days = Math.round(hours / 24);
  return relativeTime.format(days, "day");
}

async function measureImage(file: File) {
  const image = document.createElement("img");
  const url = URL.createObjectURL(file);

  try {
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        image.onload = () =>
          resolve({
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        image.onerror = () => reject(new Error("Unable to inspect image."));
        image.src = url;
      },
    );
    return dimensions;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

export function App() {
  const initialDevice = loadLocalDevice() ?? createAnonymousDevice();
  const [device, setDevice] = useState(initialDevice);
  const [nameDraft, setNameDraft] = useState(initialDevice.deviceName);
  const [inviteCode, setInviteCode] = useState("");
  const [composerFile, setComposerFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<EnvironmentReport | null>(null);
  const [nativeBusy, setNativeBusy] = useState(false);
  const queuedCommandIds = useRef(new Set<string>());
  const commandQueue = useRef<Promise<void>>(Promise.resolve());

  const registerDevice = useMutation(api.devices.registerDevice);
  const heartbeat = useMutation(api.presence.heartbeat);
  const createInvite = useMutation(api.pairing.createInvite);
  const redeemInvite = useMutation(api.pairing.redeemInvite);
  const acceptConnection = useMutation(api.pairing.acceptConnection);
  const setWallpaperControl = useMutation(api.pairing.setWallpaperControl);
  const unpair = useMutation(api.pairing.unpair);
  const createUploadUrl = useMutation(api.wallpapers.createUploadUrl);
  const sendWallpaper = useMutation(api.wallpapers.sendWallpaper);
  const markDelivered = useMutation(api.wallpapers.markDelivered);
  const markApplied = useMutation(api.wallpapers.markApplied);
  const markFailed = useMutation(api.wallpapers.markFailed);

  const appState = useQuery(api.app.getAppState, {
    deviceId: device.deviceId,
  }) as AppState | undefined;

  useEffect(() => {
    void inspectEnvironment()
      .then(setEnvironment)
      .catch((error) => {
        setEnvironment({
          platform: "unknown",
          supported: false,
          screenCount: 0,
          currentWallpaperPath: null,
          warnings: [readError(error)],
        });
      });
  }, []);

  const sendHeartbeat = useEffectEvent(async () => {
    if (!device.deviceName) {
      return;
    }

    try {
      await heartbeat({ deviceId: device.deviceId });
    } catch (error) {
      console.error(error);
    }
  });

  useEffect(() => {
    void sendHeartbeat();
    const intervalId = window.setInterval(() => {
      void sendHeartbeat();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [sendHeartbeat]);

  const applyIncomingCommand = useEffectEvent(async (command: IncomingCommand) => {
    setNativeBusy(true);

    try {
      await applyWallpaperFromUrl(command.assetUrl, command.fileName);
      await markDelivered({
        deviceId: device.deviceId,
        commandId: command._id as never,
      });
      await markApplied({
        deviceId: device.deviceId,
        commandId: command._id as never,
      });
    } catch (error) {
      const failureReason = readError(error);
      await markFailed({
        deviceId: device.deviceId,
        commandId: command._id as never,
        failureReason,
      });
      setFeedback(`Incoming wallpaper failed: ${failureReason}`);
    } finally {
      setNativeBusy(false);
    }
  });

  const enqueueIncomingCommand = useEffectEvent((command: IncomingCommand) => {
    if (queuedCommandIds.current.has(command._id)) {
      return;
    }

    queuedCommandIds.current.add(command._id);
    commandQueue.current = commandQueue.current
      .catch(() => undefined)
      .then(() => applyIncomingCommand(command))
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        queuedCommandIds.current.delete(command._id);
      });
  });

  useEffect(() => {
    if (!appState?.incomingCommands.length || !appState.device?.wallpaperControlEnabled) {
      return;
    }

    const orderedCommands = [...appState.incomingCommands].sort(
      (left, right) => left.createdAt - right.createdAt,
    );

    for (const command of orderedCommands) {
      enqueueIncomingCommand(command);
    }
  }, [
    appState?.device?.wallpaperControlEnabled,
    appState?.incomingCommands,
    enqueueIncomingCommand,
  ]);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setFeedback("Choose a device name before continuing.");
      return;
    }

    try {
      await registerDevice({
        deviceId: device.deviceId,
        deviceName: trimmed,
      });
      const nextDevice = {
        ...device,
        deviceName: trimmed,
      };
      saveLocalDevice(nextDevice);
      startTransition(() => {
        setDevice(nextDevice);
        setFeedback(null);
      });
    } catch (error) {
      setFeedback(readError(error));
    }
  }

  async function handleCreateInvite() {
    try {
      const invite = await createInvite({ deviceId: device.deviceId });
      setFeedback(`Invite ${invite.code} is ready to share.`);
    } catch (error) {
      setFeedback(readError(error));
    }
  }

  async function handleRedeemInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await redeemInvite({
        deviceId: device.deviceId,
        code: inviteCode.trim().toUpperCase(),
      });
      startTransition(() => {
        setInviteCode("");
        setFeedback("Invite redeemed. Wait for both sides to accept.");
      });
    } catch (error) {
      setFeedback(readError(error));
    }
  }

  async function handleAcceptConnection() {
    if (!appState?.connection) {
      return;
    }

    try {
      await acceptConnection({
        deviceId: device.deviceId,
        connectionId: appState.connection._id as never,
      });
      setFeedback("Connection accepted.");
    } catch (error) {
      setFeedback(readError(error));
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setComposerFile(nextFile);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(event.clipboardData.items).find((entry) =>
      entry.type.startsWith("image/"),
    );
    const file = item?.getAsFile();
    if (!file) {
      return;
    }

    setComposerFile(
      new File([file], `clipboard-${Date.now()}.png`, {
        type: file.type || "image/png",
      }),
    );
    setFeedback("Pasted image is ready to send.");
  }

  async function handleSendWallpaper() {
    if (!composerFile) {
      setFeedback("Choose or paste an image first.");
      return;
    }

    try {
      const [uploadUrl, dimensions] = await Promise.all([
        createUploadUrl({ deviceId: device.deviceId }),
        measureImage(composerFile),
      ]);

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": composerFile.type || "application/octet-stream",
        },
        body: composerFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("Image upload failed.");
      }

      const { storageId } = (await uploadResponse.json()) as { storageId: string };

      await sendWallpaper({
        fromDeviceId: device.deviceId,
        storageId: storageId as never,
        fileName: composerFile.name || "wallpaper-image",
        mimeType: composerFile.type || "application/octet-stream",
        width: dimensions.width,
        height: dimensions.height,
      });

      startTransition(() => {
        setComposerFile(null);
        setFeedback("Wallpaper sent.");
      });
    } catch (error) {
      setFeedback(readError(error));
    }
  }

  async function handleTogglePause() {
    if (!appState?.device) {
      return;
    }

    try {
      await setWallpaperControl({
        deviceId: device.deviceId,
        enabled: !appState.device.wallpaperControlEnabled,
      });
      setFeedback(
        appState.device.wallpaperControlEnabled
          ? "Incoming wallpaper changes paused."
          : "Incoming wallpaper changes resumed.",
      );
    } catch (error) {
      setFeedback(readError(error));
    }
  }

  async function handleUnpair() {
    try {
      await unpair({ deviceId: device.deviceId });
      setFeedback("Connection revoked.");
    } catch (error) {
      setFeedback(readError(error));
    }
  }

  const isRegistered = Boolean(appState?.device?.deviceName || device.deviceName);
  const isPaired = appState?.connection?.status === "paired";
  const awaitingAcceptance = appState?.connection?.status === "pending";
  const needsAcceptance = awaitingAcceptance && !appState.connection?.acceptedBySelf;
  const friendIsOnline = appState?.friendPresence?.isOnline ?? false;

  return (
    <main className="shell" onPaste={handlePaste}>
      <section className="hero">
        <div>
          <p className="eyebrow">Friends Wall MVP</p>
          <h1>Remote wallpaper control for exactly two Macs.</h1>
          <p className="muted">
            Pair once, stay live, send an image, and let the other machine apply
            it immediately through the native macOS wallpaper bridge.
          </p>
        </div>
        <div className="status-stack">
          <div className={`status-chip ${friendIsOnline ? "status-chip--online" : ""}`}>
            {appState?.friend
              ? friendIsOnline
                ? "Friend active now"
                : "Friend offline"
              : "No friend paired yet"}
          </div>
          <div className={`status-chip ${nativeBusy ? "status-chip--busy" : ""}`}>
            {nativeBusy ? "Applying wallpaper" : "Native bridge idle"}
          </div>
        </div>
      </section>

      <section className="grid">
        <article className="panel panel--tall">
          <header className="panel__header">
            <div>
              <p className="eyebrow">1. Device</p>
              <h2>Your Mac identity</h2>
            </div>
            <code>{device.deviceId.slice(0, 8)}</code>
          </header>

          {isRegistered ? (
            <div className="stack">
              <div className="metric">
                <span>Device name</span>
                <strong>{appState?.device?.deviceName ?? device.deviceName}</strong>
              </div>
              <div className="metric">
                <span>Remote control</span>
                <strong>
                  {appState?.device?.wallpaperControlEnabled ? "Enabled" : "Paused"}
                </strong>
              </div>
            </div>
          ) : (
            <form className="stack" onSubmit={handleRegister}>
              <label className="field">
                <span>Name this Mac</span>
                <input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  placeholder="Misha's MacBook"
                />
              </label>
              <button className="button" type="submit">
                Register device
              </button>
            </form>
          )}
        </article>

        <article className="panel panel--tall">
          <header className="panel__header">
            <div>
              <p className="eyebrow">2. Pairing</p>
              <h2>Invite and accept</h2>
            </div>
          </header>

          {isRegistered ? (
            <div className="stack">
              <button className="button" type="button" onClick={handleCreateInvite}>
                Create invite code
              </button>

              {appState?.activeInvite ? (
                <div className="invite-card">
                  <span>Share this code</span>
                  <strong>{appState.activeInvite.code}</strong>
                  <small>
                    Expires {formatStatusDate(appState.activeInvite.expiresAt)}
                  </small>
                </div>
              ) : null}

              <form className="stack" onSubmit={handleRedeemInvite}>
                <label className="field">
                  <span>Redeem a friend's code</span>
                  <input
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    placeholder="ABC123"
                    maxLength={6}
                  />
                </label>
                <button className="button button--ghost" type="submit">
                  Redeem code
                </button>
              </form>

              {awaitingAcceptance ? (
                <div className="callout">
                  <p>
                    {appState.friend
                      ? `Connection request with ${appState.friend.deviceName}`
                      : "Connection request pending"}
                  </p>
                  <p className="muted">
                    Both people have to accept before wallpaper control goes live.
                  </p>
                  <div className="split">
                    <span>
                      You: {appState.connection?.acceptedBySelf ? "accepted" : "waiting"}
                    </span>
                    <span>
                      Friend: {appState.connection?.friendAccepted ? "accepted" : "waiting"}
                    </span>
                  </div>
                  {needsAcceptance ? (
                    <button className="button" type="button" onClick={handleAcceptConnection}>
                      Accept connection
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="muted">Register this Mac first so the backend can pair it.</p>
          )}
        </article>

        <article className="panel panel--wide">
          <header className="panel__header">
            <div>
              <p className="eyebrow">3. Send</p>
              <h2>Push a wallpaper to your friend</h2>
            </div>
            {appState?.friend ? <span>{appState.friend.deviceName}</span> : null}
          </header>

          {isPaired ? (
            <div className="stack">
              <div className="dropzone">
                <p>Choose a local image file or paste an image anywhere in this window.</p>
                <input accept="image/*" type="file" onChange={handleFileChange} />
                {composerFile ? (
                  <strong>{composerFile.name}</strong>
                ) : (
                  <span className="muted">No image selected yet.</span>
                )}
              </div>
              <button className="button" type="button" onClick={handleSendWallpaper}>
                Send wallpaper
              </button>
            </div>
          ) : (
            <p className="muted">
              Complete pairing first. Remote send only unlocks after both people
              explicitly accept.
            </p>
          )}
        </article>

        <article className="panel">
          <header className="panel__header">
            <div>
              <p className="eyebrow">4. Safety</p>
              <h2>Pause or revoke</h2>
            </div>
          </header>

          <div className="stack">
            <button
              className="button button--ghost"
              type="button"
              onClick={handleTogglePause}
              disabled={!isRegistered}
            >
              {appState?.device?.wallpaperControlEnabled
                ? "Pause incoming changes"
                : "Resume incoming changes"}
            </button>
            <button
              className="button button--danger"
              type="button"
              onClick={handleUnpair}
              disabled={!appState?.connection}
            >
              Revoke connection
            </button>
          </div>
        </article>

        <article className="panel">
          <header className="panel__header">
            <div>
              <p className="eyebrow">Support</p>
              <h2>Local environment</h2>
            </div>
          </header>

          {environment ? (
            <div className="stack">
              <div className="metric">
                <span>Platform</span>
                <strong>{environment.platform}</strong>
              </div>
              <div className="metric">
                <span>Displays</span>
                <strong>{environment.screenCount}</strong>
              </div>
              <div className="metric">
                <span>Supported envelope</span>
                <strong>{environment.supported ? "Yes" : "Needs attention"}</strong>
              </div>
              {environment.currentWallpaperPath ? (
                <div className="metric">
                  <span>Current wallpaper</span>
                  <strong className="metric__path">{environment.currentWallpaperPath}</strong>
                </div>
              ) : null}
              {environment.warnings.length ? (
                <ul className="warning-list">
                  {environment.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">This Mac matches the strict MVP assumptions.</p>
              )}
            </div>
          ) : (
            <p className="muted">Inspecting the local Mac environment.</p>
          )}
        </article>

        <article className="panel panel--wide">
          <header className="panel__header">
            <div>
              <p className="eyebrow">Activity</p>
              <h2>Recent wallpaper commands</h2>
            </div>
          </header>

          <div className="timeline">
            {appState?.recentCommands.length ? (
              appState.recentCommands.map((command) => (
                <div className="timeline__item" key={command._id}>
                  <div>
                    <strong>{command.fileName}</strong>
                    <p className="muted">
                      {command.fromDeviceId === device.deviceId ? "Sent" : "Received"}{" "}
                      {formatStatusDate(command.createdAt)}
                    </p>
                  </div>
                  <div className={`badge badge--${command.status}`}>{command.status}</div>
                  {command.failureReason ? (
                    <p className="muted">{command.failureReason}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="muted">No wallpaper commands yet.</p>
            )}
          </div>
        </article>
      </section>

      {feedback ? (
        <aside className="toast">
          <span>{feedback}</span>
          <button
            type="button"
            className="toast__dismiss"
            onClick={() => setFeedback(null)}
          >
            Close
          </button>
        </aside>
      ) : null}
    </main>
  );
}
