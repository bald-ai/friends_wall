export type LocalIdentity = {
  deviceToken: string;
  deviceName: string;
  platform: "macos";
};

export type StagedImage = {
  file: File;
  previewUrl: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
};

export type FriendSummary = {
  deviceToken: string;
  deviceName: string;
  isOnline: boolean;
  lastHeartbeatAt: number | null;
  wallpaperControlEnabled: boolean;
};

export type InviteCodeSummary = {
  codeId: string;
  code: string;
  expiresAt: number;
};

export type ConnectionSummary = {
  connectionId: string;
  friend: FriendSummary;
};

export type CommandSummary = {
  commandId: string;
  createdAt: number;
  status: "pending" | "applying" | "applied" | "failed";
  fileName: string;
  fromDeviceName: string;
  toDeviceName: string;
  previewUrl: string | null;
  applyingAt: number | null;
  appliedAt: number | null;
  failedAt: number | null;
  failureReason: string | null;
};

export type DashboardData = {
  device: {
    deviceToken: string;
    deviceName: string;
    wallpaperControlEnabled: boolean;
    scriptOnline: boolean;
    lastScriptHeartbeatAt: number | null;
  } | null;
  activeCode: InviteCodeSummary | null;
  connection: ConnectionSummary | null;
  recentCommands: CommandSummary[];
};
