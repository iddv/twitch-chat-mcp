import { OAuthManager } from './oauthManager';
import { TokenStorage } from './tokenStorage';
import { OAuthConfig, TwitchTokens, AuthenticationError } from '../types';
import { logger } from '../utils';

/**
 * Enhanced authentication manager that handles OAuth flow, token storage, and automatic refresh
 */
export class AuthManager {
  private oauthManager: OAuthManager;
  private tokenStorage: TokenStorage;
  private currentTokens?: TwitchTokens;
  private refreshPromise?: Promise<TwitchTokens>;

  constructor(config: OAuthConfig, tokenStoragePath?: string) {
    this.oauthManager = new OAuthManager(config);
    this.tokenStorage = new TokenStorage(tokenStoragePath);
  }

  /**
   * Gets valid access token, refreshing if necessary
   */
  async getValidToken(): Promise<TwitchTokens> {
    // If we have current tokens, check if they're still valid
    if (this.currentTokens) {
      if (!this.oauthManager.isTokenExpiringSoon(this.currentTokens.expiresAt)) {
        return this.currentTokens;
      }
      
      // Token is expiring soon, refresh it
      logger.info('Token expiring soon, refreshing...');
      return await this.refreshCurrentToken();
    }

    // No current tokens, try to load from storage
    const storedTokens = await this.tokenStorage.loadTokens();
    if (storedTokens) {
      this.currentTokens = storedTokens;
      
      // Check if stored tokens are still valid
      if (!this.oauthManager.isTokenExpiringSoon(storedTokens.expiresAt)) {
        logger.info(`Loaded valid tokens for user: ${storedTokens.username}`);
        return storedTokens;
      }
      
      // Stored tokens are expiring, refresh them
      logger.info('Stored tokens expiring, refreshing...');
      return await this.refreshCurrentToken();
    }

    // No tokens available, need to authenticate
    logger.info('No tokens available, starting OAuth flow...');
    return await this.authenticate();
  }

  /**
   * Initiates OAuth authentication flow
   */
  async authenticate(): Promise<TwitchTokens> {
    try {
      const tokens = await this.oauthManager.authenticate();
      this.currentTokens = tokens;
      
      // Save tokens to storage
      await this.tokenStorage.saveTokens(tokens);
      
      logger.info(`Authentication successful for user: ${tokens.username}`);
      return tokens;
    } catch (error) {
      logger.error('Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Refreshes current token with fallback to re-authentication
   */
  private async refreshCurrentToken(): Promise<TwitchTokens> {
    // Prevent multiple concurrent refresh attempts
    if (this.refreshPromise) {
      return await this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();
    
    try {
      const tokens = await this.refreshPromise;
      return tokens;
    } finally {
      delete this.refreshPromise;
    }
  }

  /**
   * Performs the actual token refresh with fallback handling
   */
  private async performTokenRefresh(): Promise<TwitchTokens> {
    if (!this.currentTokens) {
      throw new Error('No current tokens to refresh');
    }

    try {
      // Attempt to refresh the token
      const refreshedTokens = await this.oauthManager.refreshToken(this.currentTokens.refreshToken);
      this.currentTokens = refreshedTokens;
      
      // Save refreshed tokens to storage
      await this.tokenStorage.saveTokens(refreshedTokens);
      
      logger.info(`Token refresh successful for user: ${refreshedTokens.username}`);
      return refreshedTokens;
    } catch (error) {
      logger.error('Token refresh failed, attempting re-authentication:', error);
      
      // Clear invalid tokens
      delete this.currentTokens;
      await this.tokenStorage.clearTokens();
      
      // Check if this is a recoverable error
      if (this.isRecoverableAuthError(error)) {
        // Attempt re-authentication as fallback
        try {
          const newTokens = await this.oauthManager.authenticate();
          this.currentTokens = newTokens;
          await this.tokenStorage.saveTokens(newTokens);
          
          logger.info(`Fallback authentication successful for user: ${newTokens.username}`);
          return newTokens;
        } catch (authError) {
          logger.error('Fallback authentication also failed:', authError);
          throw this.createUserFriendlyError('OAUTH_FAILED', 'Authentication failed. Please try again.');
        }
      }
      
      // Non-recoverable error, throw with user-friendly message
      throw this.createUserFriendlyError('EXPIRED_TOKEN', 'Your session has expired. Please re-authenticate.');
    }
  }

  /**
   * Validates current token without refreshing
   */
  async validateCurrentToken(): Promise<boolean> {
    if (!this.currentTokens) {
      return false;
    }

    const validation = await this.oauthManager.validateToken(this.currentTokens.accessToken);
    return validation.valid;
  }

  /**
   * Clears all stored authentication data
   */
  async clearAuthentication(): Promise<void> {
    delete this.currentTokens;
    await this.tokenStorage.clearTokens();
    await this.oauthManager.stop();
    logger.info('Authentication data cleared');
  }

  /**
   * Gets current user information if authenticated
   */
  getCurrentUser(): { username: string; scopes: string[] } | null {
    if (!this.currentTokens) {
      return null;
    }
    
    return {
      username: this.currentTokens.username,
      scopes: this.currentTokens.scopes,
    };
  }

  /**
   * Checks if authentication is available (tokens exist)
   */
  async hasAuthentication(): Promise<boolean> {
    if (this.currentTokens) {
      return true;
    }
    
    return await this.tokenStorage.hasTokens();
  }

  /**
   * Determines if an authentication error is recoverable
   */
  private isRecoverableAuthError(error: any): boolean {
    // Check if error has authError property with specific codes
    if (error.authError) {
      const authError = error.authError as AuthenticationError;
      return authError.code === 'EXPIRED_TOKEN' || authError.code === 'INVALID_TOKEN';
    }
    
    // Check for specific error messages that indicate recoverable issues
    const errorMessage = error.message?.toLowerCase() || '';
    return errorMessage.includes('expired') || 
           errorMessage.includes('invalid') || 
           errorMessage.includes('unauthorized');
  }

  /**
   * Creates user-friendly authentication error
   */
  private createUserFriendlyError(code: AuthenticationError['code'], message: string): Error {
    const authError: AuthenticationError = {
      type: 'authentication_error',
      code,
      message,
      suggestedAction: code === 'OAUTH_FAILED' ? 'Restart OAuth flow' : 'Re-authenticate via browser',
    };
    
    const error = new Error(message);
    (error as any).authError = authError;
    return error;
  }

  /**
   * Stops the OAuth manager
   */
  async stop(): Promise<void> {
    await this.oauthManager.stop();
  }
}