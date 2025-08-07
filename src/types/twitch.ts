// Twitch-related type definitions

export interface ChatMessage {
  id: string;
  username: string;
  displayName: string;
  message: string;
  timestamp: Date;
  channel: string;
  badges: string[];
  emotes?: Record<string, string>;
  isAction: boolean;
}

export interface StreamInfo {
  channelName: string;
  isLive: boolean;
  title?: string;
  game?: string;
  viewerCount?: number;
  startedAt?: Date;
  language?: string;
}

export interface TwitchTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
  username: string;
}

export interface TwitchUser {
  id: string;
  login: string;
  displayName: string;
  type: string;
  broadcasterType: string;
  description: string;
  profileImageUrl: string;
  offlineImageUrl: string;
  viewCount: number;
  createdAt: string;
}

export interface TwitchChannel {
  id: string;
  login: string;
  displayName: string;
  type: string;
  broadcasterType: string;
  description: string;
  profileImageUrl: string;
  offlineImageUrl: string;
  viewCount: number;
  createdAt: string;
}