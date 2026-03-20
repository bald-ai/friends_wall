export type DeviceRecord = {
  _id: string;
  deviceId: string;
  deviceName: string;
  wallpaperControlEnabled: boolean;
};

export type InviteRecord = {
  _id: string;
  code: string;
  expiresAt: number;
};

export type ConnectionRecord = {
  _id: string;
  deviceAId: string;
  deviceBId: string;
  status: "pending" | "paired" | "revoked";
  acceptedBySelf: boolean;
  friendAccepted: boolean;
};

export type FriendPresence = {
  isOnline: boolean;
  lastHeartbeatAt: number;
};

export type CommandRecord = {
  _id: string;
  fromDeviceId: string;
  toDeviceId: string;
  status: "sent" | "delivered" | "applied" | "failed";
  createdAt: number;
  deliveredAt?: number;
  appliedAt?: number;
  failedAt?: number;
  failureReason?: string;
  fileName: string;
  mimeType: string;
};

export type IncomingCommand = CommandRecord & {
  assetUrl: string;
};

export type AppState = {
  device: DeviceRecord | null;
  activeInvite: InviteRecord | null;
  connection: ConnectionRecord | null;
  friend: DeviceRecord | null;
  friendPresence: FriendPresence | null;
  incomingCommands: IncomingCommand[];
  recentCommands: CommandRecord[];
};
