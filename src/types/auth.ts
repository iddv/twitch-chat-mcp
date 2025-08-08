// Authentication-related type definitions

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string; // Optional for implicit flow
  redirectUri: string;
  scopes: string[];
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

export interface AuthenticationError {
  type: "authentication_error";
  code: "INVALID_TOKEN" | "EXPIRED_TOKEN" | "OAUTH_FAILED";
  message: string;
  suggestedAction: "Re-authenticate via browser" | "Check token permissions" | "Restart OAuth flow";
}

export interface TokenValidationResult {
  valid: boolean;
  expiresAt?: Date;
  scopes?: string[];
  username?: string;
  error?: AuthenticationError;
}