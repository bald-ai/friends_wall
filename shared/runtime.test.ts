import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  PRESENCE_WINDOW_MS,
  deriveActiveInvite,
  derivePresenceStatus,
  isInviteExpiredAt,
  isPresenceFreshAt,
  shouldSendHeartbeatOnResume,
} from "./runtime";

describe("invite expiry", () => {
  it("keeps an invite active before the expiration boundary", () => {
    const invite = { code: "ABC123", expiresAt: 10_000 };

    expect(deriveActiveInvite(invite, 9_999)).toEqual(invite);
    expect(isInviteExpiredAt(invite.expiresAt, 9_999)).toBe(false);
  });

  it("expires an invite exactly at its expiration timestamp", () => {
    const invite = { code: "ABC123", expiresAt: 10_000 };

    expect(deriveActiveInvite(invite, 10_000)).toBeNull();
    expect(isInviteExpiredAt(invite.expiresAt, 10_000)).toBe(true);
  });
});

describe("presence freshness", () => {
  it("reports a friend online while heartbeats are still fresh", () => {
    const presence = { isOnline: true, lastHeartbeatAt: 50_000 };
    const currentTime = presence.lastHeartbeatAt + PRESENCE_WINDOW_MS - 1;

    expect(derivePresenceStatus(presence, currentTime)).toBe(true);
    expect(isPresenceFreshAt(presence.lastHeartbeatAt, currentTime)).toBe(true);
  });

  it("marks a friend offline once the heartbeat window has elapsed", () => {
    const presence = { isOnline: true, lastHeartbeatAt: 50_000 };
    const currentTime = presence.lastHeartbeatAt + PRESENCE_WINDOW_MS + 1;

    expect(derivePresenceStatus(presence, currentTime)).toBe(false);
    expect(isPresenceFreshAt(presence.lastHeartbeatAt, currentTime)).toBe(false);
  });

  it("stays offline when the backend presence flag is already false", () => {
    const presence = { isOnline: false, lastHeartbeatAt: 50_000 };

    expect(derivePresenceStatus(presence, 50_000)).toBe(false);
  });
});

describe("resume heartbeat", () => {
  it("sends immediately when no prior heartbeat attempt exists", () => {
    expect(shouldSendHeartbeatOnResume(null, 25_000)).toBe(true);
  });

  it("suppresses duplicate resume heartbeats inside the normal interval", () => {
    expect(shouldSendHeartbeatOnResume(25_000, 25_000 + HEARTBEAT_INTERVAL_MS - 1)).toBe(
      false,
    );
  });

  it("forces a heartbeat after a sleep-sized gap", () => {
    expect(shouldSendHeartbeatOnResume(25_000, 25_000 + HEARTBEAT_INTERVAL_MS * 3)).toBe(
      true,
    );
  });
});
