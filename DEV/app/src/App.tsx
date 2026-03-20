import { type ChangeEvent, type DragEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { convexApi } from "./lib/convexApi";
import { createIdentity, loadIdentity, saveIdentity } from "./lib/storage";
import type { DashboardData, InviteCodeSummary, LocalIdentity, StagedImage } from "./types";

type AppProps = {
  convexEnabled: boolean;
};

const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim() || "";

function getInitialIdentity() {
  const existing = loadIdentity();
  if (existing) {
    return existing;
  }

  const created = createIdentity();
  saveIdentity(created);
  return created;
}

function formatDateTime(value: number | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatRelativeTime(value: number | null) {
  if (!value) {
    return "never";
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - value) / 60_000));
  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.round(diffHours / 24)}d ago`;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function readImage(file: File) {
  const previewUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Could not read that image."));
      nextImage.src = previewUrl;
    });

    return {
      file,
      previewUrl,
      fileName: file.name || `wallpaper-${Date.now()}.png`,
      mimeType: file.type || "image/png",
      width: image.naturalWidth,
      height: image.naturalHeight,
      size: file.size,
    } satisfies StagedImage;
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

function releaseImage(image: StagedImage | null) {
  if (image) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

export default function App({ convexEnabled }: AppProps) {
  const [identity, setIdentity] = useState<LocalIdentity>(() => getInitialIdentity());
  const [deviceNameDraft, setDeviceNameDraft] = useState(identity.deviceName);
  const [stagedImage, setStagedImage] = useState<StagedImage | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    "Name this Mac, connect to one friend, then drag in an image.",
  );
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const identityReady = identity.deviceName.trim().length > 0;

  useEffect(() => () => releaseImage(stagedImage), [stagedImage]);

  async function replaceStagedImage(file: File) {
    const nextImage = await readImage(file);
    setStagedImage((current) => {
      releaseImage(current);
      return nextImage;
    });
    setStatusMessage(`Staged ${nextImage.fileName}. Ready to send when the pair is active.`);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) {
      return;
    }

    await replaceStagedImage(nextFile);
    event.target.value = "";
  }

  async function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);

    const nextFile = Array.from(event.dataTransfer.files).find((file) =>
      file.type.startsWith("image/"),
    );

    if (!nextFile) {
      setStatusMessage("Drop a PNG, JPG, or another image file.");
      return;
    }

    await replaceStagedImage(nextFile);
  }

  function handleSaveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = deviceNameDraft.trim();

    if (!nextName) {
      setStatusMessage("Give this Mac a name before you pair it.");
      return;
    }

    const nextIdentity = {
      ...identity,
      deviceName: nextName,
    } satisfies LocalIdentity;

    setIdentity(nextIdentity);
    saveIdentity(nextIdentity);
    setStatusMessage(`Saved this browser as ${nextName}.`);
  }

  return (
    <div className="page-shell">
      <div className="page-noise" />

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Friends Wall MVP</p>
          <h1>Quiet wallpaper messages for exactly two Macs.</h1>
          <p className="lede">
            No feed, no notifications, no app shell. You connect one friend, drop one
            image, and their desktop changes when their local listener is online.
          </p>
        </div>

        <div className="hero-rail">
          <div className="rail-card">
            <span>Step 1</span>
            <p>Save this Mac and create or redeem a pairing code.</p>
          </div>
          <div className="rail-card">
            <span>Step 2</span>
            <p>Run the local Node listener on each Mac so presence means something.</p>
          </div>
          <div className="rail-card">
            <span>Step 3</span>
            <p>Drag in an image and send it straight to your friend’s wallpaper.</p>
          </div>
        </div>
      </header>

      <main className="app-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-eyebrow">Identity</p>
              <h2>Name this Mac</h2>
            </div>
            <span className="token-chip">{identity.deviceToken.slice(0, 8)}</span>
          </div>

          <form className="stack" onSubmit={handleSaveIdentity}>
            <label className="field">
              <span>Device name</span>
              <input
                value={deviceNameDraft}
                onChange={(event) => setDeviceNameDraft(event.target.value)}
                placeholder="Michal's MacBook Air"
              />
            </label>
            <button className="primary-button" type="submit">
              Save identity
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-eyebrow">Local listener</p>
              <h2>Run the Mac script</h2>
            </div>
            <span className={`status-pill ${convexEnabled ? "status-pill-live" : ""}`}>
              {convexEnabled ? "Config ready" : "Waiting for Convex URL"}
            </span>
          </div>

          <p className="panel-copy">
            Presence only means the local script is running. The web page itself never marks
            you online.
          </p>

          <pre className="command-block">
            <code>{buildScriptCommand(identity)}</code>
          </pre>

          <p className="hint-copy">
            Replace the placeholder URL after backend setup if you have not filled in{" "}
            <code>VITE_CONVEX_URL</code> yet.
          </p>
        </section>

        <section className="panel image-panel">
          <div className="panel-heading">
            <div>
              <p className="section-eyebrow">Wallpaper send</p>
              <h2>Drop one image</h2>
            </div>
            {stagedImage ? <span className="status-pill status-pill-warm">Ready</span> : null}
          </div>

          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />

          <button
            className={`dropzone ${dragActive ? "dropzone-active" : ""}`}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={(event) => {
              void handleDrop(event);
            }}
          >
            {stagedImage ? (
              <>
                <img alt={stagedImage.fileName} src={stagedImage.previewUrl} />
                <div className="dropzone-copy">
                  <strong>{stagedImage.fileName}</strong>
                  <span>
                    {stagedImage.width} x {stagedImage.height} · {formatFileSize(stagedImage.size)}
                  </span>
                </div>
              </>
            ) : (
              <div className="dropzone-copy">
                <strong>Drag an image here</strong>
                <span>Or click to choose a file from disk.</span>
              </div>
            )}
          </button>

          <div className="inline-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Pick another image
            </button>
            <button
              className="secondary-button secondary-button-muted"
              type="button"
              onClick={() => {
                releaseImage(stagedImage);
                setStagedImage(null);
                setStatusMessage("Cleared the staged image.");
              }}
            >
              Clear
            </button>
          </div>
        </section>

        <section className="panel status-panel">
          <p className="section-eyebrow">Status</p>
          <div className="status-banner">{statusMessage}</div>
        </section>

        <section className="panel spanning-panel">
          {convexEnabled ? (
            identityReady ? (
              <ConnectedWorkspace
                identity={identity}
                stagedImage={stagedImage}
                onMessage={setStatusMessage}
              />
            ) : (
              <EmptyState
                title="Save the local identity first"
                body="Pairing and sends stay locked until this browser has a stable device name."
              />
            )
          ) : (
            <EmptyState
              title="Convex is not configured yet"
              body="Add VITE_CONVEX_URL in DEV/app/.env, then the pairing code flow, uploads, presence, and command log will all come alive."
            />
          )}
        </section>
      </main>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <p className="section-eyebrow">Backend setup</p>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function ConnectedWorkspace({
  identity,
  stagedImage,
  onMessage,
}: {
  identity: LocalIdentity;
  stagedImage: StagedImage | null;
  onMessage: (message: string) => void;
}) {
  const dashboard = useQuery(convexApi.dashboard.get, {
    deviceToken: identity.deviceToken,
  }) as DashboardData | undefined;

  const ensureDevice = useMutation(convexApi.devices.ensure);
  const createCode = useMutation(convexApi.pairing.createCode);
  const redeemCode = useMutation(convexApi.pairing.redeemCode);
  const unpair = useMutation(convexApi.pairing.unpair);
  const setWallpaperControl = useMutation(convexApi.devices.setWallpaperControl);
  const createUploadUrl = useMutation(convexApi.wallpapers.createUploadUrl);
  const queueSend = useMutation(convexApi.wallpapers.queueSend);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");

  useEffect(() => {
    void ensureDevice({
      deviceToken: identity.deviceToken,
      deviceName: identity.deviceName,
      platform: "macos",
    });
  }, [ensureDevice, identity.deviceName, identity.deviceToken]);

  async function runAction(label: string, task: () => Promise<void>) {
    setBusyAction(label);
    try {
      await task();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateCode() {
    await runAction("create-code", async () => {
      const invite = (await createCode({
        deviceToken: identity.deviceToken,
      })) as InviteCodeSummary;

      onMessage(`Pairing code ${invite.code} is live until ${formatDateTime(invite.expiresAt)}.`);
    });
  }

  async function handleRedeemCode() {
    const code = codeInput.trim().toUpperCase();
    if (!code) {
      onMessage("Enter a six-character pairing code.");
      return;
    }

    await runAction("redeem-code", async () => {
      await redeemCode({
        deviceToken: identity.deviceToken,
        code,
      });

      setCodeInput("");
      onMessage(`Connected this Mac using ${code}.`);
    });
  }

  async function handleSend() {
    if (!stagedImage) {
      onMessage("Stage an image before sending.");
      return;
    }

    const connection = dashboard?.connection;
    if (!connection) {
      onMessage("Pair with a friend first.");
      return;
    }

    await runAction("send", async () => {
      const uploadUrl = (await createUploadUrl({})) as string;

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": stagedImage.mimeType,
        },
        body: stagedImage.file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}.`);
      }

      const uploadJson = (await uploadResponse.json()) as { storageId?: string };
      if (!uploadJson.storageId) {
        throw new Error("Upload did not return a storageId.");
      }

      await queueSend({
        deviceToken: identity.deviceToken,
        storageId: uploadJson.storageId,
        fileName: stagedImage.fileName,
        mimeType: stagedImage.mimeType,
        width: stagedImage.width,
        height: stagedImage.height,
      });

      onMessage(`Queued ${stagedImage.fileName} for ${connection.friend.deviceName}.`);
    });
  }

  const isConnected = Boolean(dashboard?.connection);
  const friend = dashboard?.connection?.friend ?? null;
  const localDevice = dashboard?.device ?? null;

  return (
    <div className="workspace-grid">
      <section className="panel flush-panel">
        <div className="panel-heading">
          <div>
            <p className="section-eyebrow">Pairing</p>
            <h2>One code, one friend</h2>
          </div>
          {busyAction ? <span className="token-chip">Working</span> : null}
        </div>

        {isConnected && friend ? (
          <div className="connection-card">
            <div className="connection-row">
              <div>
                <strong>{friend.deviceName}</strong>
                <p>
                  {friend.isOnline
                    ? "Listener online"
                    : `Offline, last heartbeat ${formatRelativeTime(friend.lastHeartbeatAt)}`}
                </p>
              </div>
              <span className={`presence-dot ${friend.isOnline ? "presence-live" : ""}`} />
            </div>

            <div className="info-grid">
              <div className="info-card">
                <span>Their incoming state</span>
                <strong>
                  {friend.wallpaperControlEnabled ? "Ready for new images" : "Paused locally"}
                </strong>
              </div>
              <div className="info-card">
                <span>Your listener</span>
                <strong>
                  {localDevice?.scriptOnline
                    ? "Online now"
                    : `Last seen ${formatRelativeTime(localDevice?.lastScriptHeartbeatAt ?? null)}`}
                </strong>
              </div>
            </div>

            <div className="toggle-card">
              <div>
                <strong>Incoming changes on this Mac</strong>
                <p>
                  {localDevice?.wallpaperControlEnabled
                    ? "Your friend can update this wallpaper."
                    : "New commands will wait until you resume."}
                </p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  void runAction("toggle-pause", async () => {
                    await setWallpaperControl({
                      deviceToken: identity.deviceToken,
                      enabled: !localDevice?.wallpaperControlEnabled,
                    });

                    onMessage(
                      localDevice?.wallpaperControlEnabled
                        ? "Paused incoming wallpaper changes."
                        : "Resumed incoming wallpaper changes.",
                    );
                  })
                }
              >
                {localDevice?.wallpaperControlEnabled ? "Pause" : "Resume"}
              </button>
            </div>

            <div className="inline-actions">
              <button className="primary-button" type="button" onClick={() => void handleSend()}>
                {busyAction === "send" ? "Sending..." : "Send staged wallpaper"}
              </button>
              <button
                className="secondary-button secondary-button-muted"
                type="button"
                onClick={() =>
                  void runAction("unpair", async () => {
                    await unpair({ deviceToken: identity.deviceToken });
                    onMessage("Unpaired this friend connection.");
                  })
                }
              >
                Unpair
              </button>
            </div>
          </div>
        ) : (
          <div className="pairing-grid">
            <article className="pairing-card">
              <strong>Create a code</strong>
              <p>Make a short invite and send it to one friend.</p>
              <button className="primary-button" type="button" onClick={() => void handleCreateCode()}>
                {busyAction === "create-code" ? "Creating..." : "Create code"}
              </button>
              {dashboard?.activeCode ? <CodeBadge invite={dashboard.activeCode} /> : null}
            </article>

            <article className="pairing-card">
              <strong>Redeem a code</strong>
              <p>Paste your friend’s code and connect instantly.</p>
              <label className="field">
                <span>Pairing code</span>
                <input
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
                  placeholder="AB12CD"
                  maxLength={6}
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleRedeemCode()}
              >
                {busyAction === "redeem-code" ? "Connecting..." : "Redeem code"}
              </button>
            </article>
          </div>
        )}
      </section>

      <section className="panel flush-panel">
        <div className="panel-heading">
          <div>
            <p className="section-eyebrow">Command log</p>
            <h2>Recent wallpaper deliveries</h2>
          </div>
        </div>

        {dashboard?.recentCommands.length ? (
          <div className="command-list">
            {dashboard.recentCommands.map((command) => (
              <article className="command-card" key={command.commandId}>
                {command.previewUrl ? (
                  <img alt={command.fileName} src={command.previewUrl} />
                ) : (
                  <div className="command-fallback" />
                )}
                <div className="command-copy">
                  <div className="command-meta">
                    <strong>{command.status}</strong>
                    <span>{formatDateTime(command.createdAt)}</span>
                  </div>
                  <p>
                    {command.fromDeviceName} to {command.toDeviceName}
                  </p>
                  {command.failureReason ? <small>{command.failureReason}</small> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="panel-copy">
            No wallpaper commands yet. Pair first, then send a staged image.
          </p>
        )}
      </section>
    </div>
  );
}

function CodeBadge({ invite }: { invite: InviteCodeSummary }) {
  return (
    <div className="code-badge">
      <span>{invite.code}</span>
      <small>Expires {formatDateTime(invite.expiresAt)}</small>
    </div>
  );
}

function buildScriptCommand(identity: LocalIdentity) {
  const activeUrl = convexUrl || "https://your-deployment.convex.cloud";

  return [
    `FW_CONVEX_URL="${activeUrl}"`,
    `FW_DEVICE_TOKEN="${identity.deviceToken}"`,
    `FW_DEVICE_NAME="${identity.deviceName || "This Mac"}"`,
    "node ../script/wallpaper-listener.mjs",
  ].join(" ");
}
