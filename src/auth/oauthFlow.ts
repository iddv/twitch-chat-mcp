/**
 * Twitch OAuth 2.0 Flow Implementation
 * 
 * Implements secure OAuth 2.0 authorization code grant flow
 */

import crypto from 'crypto';
import axios from 'axios';
import { setupLogger } from '../utils/logger';
import { getJWTService } from './jwtService';
import { getCredentialStore } from '../storage/credentialStore';
import { 
  TwitchOAuthConfig, 
  OAuthState, 
  TwitchTokenResponse, 
  TwitchUserInfo,
  StoredCredentials,
  OAuthError 
} from '../types/oauth';

const logger = setupLogger();

export class OAuthFlow {
  private config: TwitchOAuthConfig;
  private stateStore: Map<string, OAuthState> = new Map();
  private jwtService = getJWTService();
  private credentialStore = getCredentialStore();

  // Twitch OAuth endpoints
  private readonly TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
  private readonly TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
  private readonly TWITCH_USER_URL = 'https://api.twitch.tv/helix/users';

  constructor() {
    this.config = {
      clientId: process.env.TWITCH_CLIENT_ID || '',
      clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
      redirectUri: process.env.TWITCH_REDIRECT_URI || 'http://localhost:3001/auth/callback',
      scopes: this.getRequiredScopes()
    };

    this.validateConfig();
    this.startStateCleanup();
  }

  /**
   * Validate OAuth configuration
   */
  private validateConfig(): void {
    if (!this.config.clientId) {
      throw new Error('TWITCH_CLIENT_ID environment variable is required');
    }
    if (!this.config.clientSecret) {
      throw new Error('TWITCH_CLIENT_SECRET environment variable is required');
    }
    if (!this.config.redirectUri) {
      throw new Error('TWITCH_REDIRECT_URI environment variable is required');
    }
  }

  /**
   * Get required Twitch scopes based on permission levels
   */
  private getRequiredScopes(): string[] {
    return [
      'user:read:email',           // Basic user info
      'chat:read',                 // Read chat messages
      'chat:edit',                 // Send chat messages
      'channel:moderate',          // Moderation capabilities
      'moderator:manage:chat_messages', // Manage chat messages
      'user:read:follows',         // Read follow information
      'channel:read:subscriptions' // Read subscription info
    ];
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  generateAuthUrl(permissionLevel: string = 'chatbot'): { url: string; state: string } {
    const state = this.generateState();
    const sessionId = this.jwtService.generateSessionId();

    // Store state for validation
    this.stateStore.set(state, {
      state,
      sessionId,
      createdAt: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    });

    // Filter scopes based on permission level
    const scopes = this.getScopesForPermissionLevel(permissionLevel);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(' '),
      state: state,
      force_verify: 'true' // Force user to re-authorize
    });

    const authUrl = `${this.TWITCH_AUTH_URL}?${params.toString()}`;

    logger.info('Generated OAuth authorization URL', {
      state,
      sessionId,
      permissionLevel,
      scopes: scopes.length
    });

    return { url: authUrl, state };
  }

  /**
   * Get scopes for specific permission level
   */
  private getScopesForPermissionLevel(level: string): string[] {
    const baseScopes = ['user:read:email'];
    
    switch (level) {
      case 'viewer':
        return baseScopes;
      case 'chatbot':
        return [...baseScopes, 'chat:read', 'chat:edit'];
      case 'moderator':
        return [...baseScopes, 'chat:read', 'chat:edit', 'channel:moderate', 'moderator:manage:chat_messages'];
      case 'admin':
        return this.config.scopes; // All scopes
      default:
        return [...baseScopes, 'chat:read', 'chat:edit'];
    }
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string, state: string): Promise<{ jwt: string; user: TwitchUserInfo }> {
    try {
      // Validate state parameter
      const storedState = this.validateState(state);
      
      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code);
      
      // Get user information
      const userInfo = await this.getUserInfo(tokenResponse.access_token);
      
      // Store credentials securely using credential store
      const credentials: StoredCredentials = {
        userId: crypto.createHash('sha256').update(userInfo.id).digest('hex'),
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: new Date(Date.now() + (tokenResponse.expires_in * 1000)),
        scopes: tokenResponse.scope,
        twitchUserId: userInfo.id,
        username: userInfo.login
      };

      // Store encrypted credentials
      await this.credentialStore.storeCredentials(credentials.userId, credentials);

      logger.info('OAuth callback successful', {
        userId: credentials.userId,
        username: userInfo.login,
        scopes: tokenResponse.scope.length,
        expiresAt: credentials.expiresAt
      });

      // Create JWT session token
      const jwt = this.jwtService.createToken({
        userId: credentials.userId,
        sessionId: storedState.sessionId,
        twitchUserId: userInfo.id,
        username: userInfo.login,
        permissionLevel: this.determinePermissionLevel(tokenResponse.scope)
      });

      // Clean up state
      this.stateStore.delete(state);

      return { jwt, user: userInfo };
    } catch (error) {
      logger.error('OAuth callback failed', { error, code: code?.substring(0, 10) });
      throw error;
    }
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<TwitchTokenResponse> {
    try {
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri
      });

      const response = await axios.post(this.TWITCH_TOKEN_URL, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data.error) {
        throw new Error(`Token exchange failed: ${response.data.error_description}`);
      }

      logger.debug('Token exchange successful', {
        expiresIn: response.data.expires_in,
        scopes: response.data.scope?.length || 0
      });

      return response.data;
    } catch (error) {
      logger.error('Token exchange failed', { error });
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }

  /**
   * Get user information from Twitch API
   */
  private async getUserInfo(accessToken: string): Promise<TwitchUserInfo> {
    try {
      const response = await axios.get(this.TWITCH_USER_URL, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': this.config.clientId
        }
      });

      if (!response.data.data || response.data.data.length === 0) {
        throw new Error('No user data returned from Twitch API');
      }

      const userInfo = response.data.data[0];
      
      logger.debug('User info retrieved', {
        userId: userInfo.id,
        username: userInfo.login,
        displayName: userInfo.display_name
      });

      return userInfo;
    } catch (error) {
      logger.error('Failed to get user info', { error });
      throw new Error('Failed to retrieve user information');
    }
  }

  /**
   * Validate state parameter
   */
  private validateState(state: string): OAuthState {
    const storedState = this.stateStore.get(state);
    
    if (!storedState) {
      throw new Error('Invalid or expired state parameter');
    }

    if (Date.now() > storedState.expiresAt) {
      this.stateStore.delete(state);
      throw new Error('State parameter has expired');
    }

    return storedState;
  }

  /**
   * Generate secure random state parameter
   */
  private generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Determine permission level based on granted scopes
   */
  private determinePermissionLevel(scopes: string[]): 'viewer' | 'chatbot' | 'moderator' | 'admin' {
    if (scopes.includes('channel:read:subscriptions') && scopes.includes('moderator:manage:chat_messages')) {
      return 'admin';
    } else if (scopes.includes('channel:moderate')) {
      return 'moderator';
    } else if (scopes.includes('chat:edit')) {
      return 'chatbot';
    } else {
      return 'viewer';
    }
  }

  /**
   * Clean up expired state entries
   */
  private startStateCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const expiredStates: string[] = [];

      for (const [state, stateData] of this.stateStore.entries()) {
        if (now > stateData.expiresAt) {
          expiredStates.push(state);
        }
      }

      for (const state of expiredStates) {
        this.stateStore.delete(state);
      }

      if (expiredStates.length > 0) {
        logger.debug('Cleaned up expired OAuth states', { count: expiredStates.length });
      }
    }, 5 * 60 * 1000); // Clean up every 5 minutes
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(userId: string): Promise<TwitchTokenResponse> {
    try {
      const credentials = await this.credentialStore.getCredentials(userId);
      if (!credentials || !credentials.refreshToken) {
        throw new Error('No refresh token available for user');
      }

      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken
      });

      const response = await axios.post(this.TWITCH_TOKEN_URL, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data.error) {
        throw new Error(`Token refresh failed: ${response.data.error_description}`);
      }

      // Update stored credentials with new tokens
      await this.credentialStore.updateCredentials(userId, {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || credentials.refreshToken,
        expiresAt: new Date(Date.now() + (response.data.expires_in * 1000)),
        scopes: response.data.scope || credentials.scopes
      });

      logger.info('Token refresh successful', {
        userId,
        expiresIn: response.data.expires_in
      });

      return response.data;
    } catch (error) {
      logger.error('Token refresh failed', { error, userId });
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Get valid access token for user (refresh if needed)
   */
  async getValidAccessToken(userId: string): Promise<string | null> {
    try {
      const credentials = await this.credentialStore.getCredentials(userId);
      if (!credentials) {
        return null;
      }

      // Check if token is expired or will expire soon (5 minutes buffer)
      const now = new Date();
      const expiryBuffer = new Date(credentials.expiresAt.getTime() - (5 * 60 * 1000));
      
      if (now > expiryBuffer) {
        logger.info('Access token expired, refreshing', { userId });
        await this.refreshAccessToken(userId);
        
        // Get updated credentials
        const updatedCredentials = await this.credentialStore.getCredentials(userId);
        return updatedCredentials?.accessToken || null;
      }

      return credentials.accessToken;
    } catch (error) {
      logger.error('Failed to get valid access token', { error, userId });
      return null;
    }
  }
}

/**
 * Global OAuth flow instance
 */
let oauthFlowInstance: OAuthFlow | null = null;

export function getOAuthFlow(): OAuthFlow {
  if (!oauthFlowInstance) {
    oauthFlowInstance = new OAuthFlow();
  }
  return oauthFlowInstance;
}
