/**
 * OAuth 2.0 Type Definitions for Twitch Integration
 */

export interface TwitchOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthState {
  state: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
}

export interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: 'bearer';
}

export interface TwitchUserInfo {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  email?: string;
  created_at: string;
}

export interface StoredCredentials {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
  twitchUserId: string;
  username: string;
}

export interface JWTPayload {
  userId: string;
  sessionId: string;
  twitchUserId: string;
  username: string;
  permissionLevel: 'viewer' | 'chatbot' | 'moderator' | 'admin';
  iat: number;
  exp: number;
}

export interface OAuthError {
  error: string;
  error_description?: string;
  state?: string;
}
