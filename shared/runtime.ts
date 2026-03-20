export const INVITE_TTL_MS = 1000 * 60 * 10;
export const HEARTBEAT_INTERVAL_MS = 1000 * 10;
export const PRESENCE_WINDOW_MS = 1000 * 20;

export type ExpiringRecord = {
  expiresAt: number;
};

export type PresenceRecord = {
  isOnline: boolean;
  lastHeartbeatAt: number;
};

export function isInviteExpiredAt(expiresAt: number, currentTime: number) {
  return expiresAt <= currentTime;
}

export function deriveActiveInvite<T extends ExpiringRecord>(
  invite: T | null | undefined,
  currentTime: number,
) {
  if (!invite || isInviteExpiredAt(invite.expiresAt, currentTime)) {
    return null;
  }

  return invite;
}

export function isPresenceFreshAt(
  lastHeartbeatAt: number,
  currentTime: number,
  windowMs = PRESENCE_WINDOW_MS,
) {
  return currentTime - lastHeartbeatAt <= windowMs;
}

export function derivePresenceStatus(
  presence: PresenceRecord | null | undefined,
  currentTime: number,
  windowMs = PRESENCE_WINDOW_MS,
) {
  if (!presence?.isOnline) {
    return false;
  }

  return isPresenceFreshAt(presence.lastHeartbeatAt, currentTime, windowMs);
}

export function shouldSendHeartbeatOnResume(
  lastHeartbeatAttemptAt: number | null,
  currentTime: number,
  heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
) {
  if (lastHeartbeatAttemptAt === null) {
    return true;
  }

  return currentTime - lastHeartbeatAttemptAt >= heartbeatIntervalMs;
}
