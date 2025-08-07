import express from 'express';
import { Server } from 'http';
import open from 'open';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { OAuthConfig, TwitchTokens, OAuthTokenResponse, AuthenticationError, TokenValidationResult } from '../types';
import { logger } from '../utils';

export class OAuthManager {
  private config: OAuthConfig;
  private server?: Server;
  private authPromise?: Promise<TwitchTokens>;
  private authResolve?: (tokens: TwitchTokens) => void;
  private authReject?: (error: Error) => void;
  private state?: string;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  /**
   * Initiates OAuth authentication flow with local web server
   */
  async authenticate(): Promise<TwitchTokens> {
    if (this.authPromise) {
      return this.authPromise;
    }

    this.authPromise = new Promise<TwitchTokens>((resolve, reject) => {
      this.authResolve = resolve;
      this.authReject = reject;
    });

    try {
      await this.startLocalServer();
      await this.launchBrowser();
      return await this.authPromise;
    } catch (error) {
      this.cleanup();
      throw this.createAuthError('OAUTH_FAILED', `OAuth authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Starts local HTTP server for OAuth callback handling
   */
  private async startLocalServer(): Promise<void> {
    const app = express();
    
    // Parse URL-encoded bodies for OAuth callback
    app.use(express.urlencoded({ extended: true }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ready', message: 'OAuth server is running' });
    });

    // OAuth callback endpoint
    app.get('/callback', async (req, res) => {
      try {
        const { code, state, error, error_description } = req.query;

        // Handle OAuth errors
        if (error) {
          const errorMsg = error_description || error;
          logger.error('OAuth callback error:', errorMsg);
          res.status(400).send(`
            <html>
              <body>
                <h1>Authentication Failed</h1>
                <p>Error: ${errorMsg}</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          this.authReject?.(this.createAuthError('OAUTH_FAILED', `OAuth error: ${errorMsg}`));
          return;
        }

        // Validate state parameter
        if (state !== this.state) {
          logger.error('OAuth state mismatch');
          res.status(400).send(`
            <html>
              <body>
                <h1>Authentication Failed</h1>
                <p>Invalid state parameter. This may be a security issue.</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          this.authReject?.(this.createAuthError('OAUTH_FAILED', 'Invalid state parameter'));
          return;
        }

        if (!code) {
          res.status(400).send(`
            <html>
              <body>
                <h1>Authentication Failed</h1>
                <p>No authorization code received.</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          this.authReject?.(this.createAuthError('OAUTH_FAILED', 'No authorization code received'));
          return;
        }

        // Exchange code for tokens
        const tokens = await this.exchangeCodeForTokens(code as string);
        
        res.send(`
          <html>
            <body>
              <h1>Authentication Successful!</h1>
              <p>You have successfully authenticated with Twitch.</p>
              <p>You can close this window and return to Claude.</p>
              <script>
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `);

        this.authResolve?.(tokens);
      } catch (error) {
        logger.error('OAuth callback processing error:', error);
        res.status(500).send(`
          <html>
            <body>
              <h1>Authentication Error</h1>
              <p>An error occurred while processing your authentication.</p>
              <p>You can close this window and try again.</p>
            </body>
          </html>
        `);
        this.authReject?.(error instanceof Error ? error : new Error('Unknown callback error'));
      }
    });

    return new Promise((resolve, reject) => {
      const port = new URL(this.config.redirectUri).port || '3000';
      this.server = app.listen(parseInt(port), 'localhost', () => {
        logger.info(`OAuth callback server started on ${this.config.redirectUri}`);
        resolve();
      });

      this.server.on('error', (error) => {
        logger.error('OAuth server error:', error);
        reject(error);
      });
    });
  }

  /**
   * Launches browser for OAuth initiation
   */
  private async launchBrowser(): Promise<void> {
    this.state = uuidv4();
    
    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', this.config.scopes.join(' '));
    authUrl.searchParams.set('state', this.state);

    logger.info('Opening browser for OAuth authentication...');
    logger.debug('Auth URL:', authUrl.toString());

    try {
      await open(authUrl.toString());
    } catch (error) {
      logger.error('Failed to open browser:', error);
      throw new Error(`Failed to open browser for authentication: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Exchanges authorization code for access tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<TwitchTokens> {
    try {
      const response = await axios.post<OAuthTokenResponse>('https://id.twitch.tv/oauth2/token', {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      const tokenData = response.data;
      
      // Get user information to include username in tokens
      const userInfo = await this.getUserInfo(tokenData.access_token);

      const tokens: TwitchTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scopes: Array.isArray(tokenData.scope) ? tokenData.scope : (tokenData.scope as string).split(' '),
        username: userInfo.login,
      };

      logger.info(`Successfully authenticated user: ${tokens.username}`);
      return tokens;
    } catch (error) {
      logger.error('Token exchange failed:', error);
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.message || error.message;
        throw this.createAuthError('OAUTH_FAILED', `Token exchange failed: ${errorMsg}`);
      }
      throw this.createAuthError('OAUTH_FAILED', `Token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets user information from Twitch API
   */
  private async getUserInfo(accessToken: string): Promise<{ login: string }> {
    try {
      const response = await axios.get('https://api.twitch.tv/helix/users', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': this.config.clientId,
        },
        timeout: 5000,
      });

      const userData = response.data.data[0];
      if (!userData) {
        throw new Error('No user data returned from Twitch API');
      }

      return { login: userData.login };
    } catch (error) {
      logger.error('Failed to get user info:', error);
      throw new Error(`Failed to get user information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Refreshes access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TwitchTokens> {
    try {
      logger.info('Refreshing access token...');
      
      const response = await axios.post<OAuthTokenResponse>('https://id.twitch.tv/oauth2/token', {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      const tokenData = response.data;
      
      // Get user information to include username in tokens
      const userInfo = await this.getUserInfo(tokenData.access_token);

      const tokens: TwitchTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refreshToken, // Use new refresh token if provided, otherwise keep the old one
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scopes: Array.isArray(tokenData.scope) ? tokenData.scope : (tokenData.scope as string).split(' '),
        username: userInfo.login,
      };

      logger.info(`Successfully refreshed token for user: ${tokens.username}`);
      return tokens;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.message || error.message;
        throw this.createAuthError('EXPIRED_TOKEN', `Token refresh failed: ${errorMsg}`);
      }
      throw this.createAuthError('EXPIRED_TOKEN', `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validates if a token is still valid and not expired
   */
  async validateToken(accessToken: string): Promise<TokenValidationResult> {
    try {
      const response = await axios.get('https://id.twitch.tv/oauth2/validate', {
        headers: {
          'Authorization': `OAuth ${accessToken}`,
        },
        timeout: 5000,
      });

      const data = response.data;
      return {
        valid: true,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        username: data.login,
      };
    } catch (error) {
      logger.error('Token validation failed:', error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        const authError = this.createAuthError('INVALID_TOKEN', 'Token is invalid or expired');
        return {
          valid: false,
          error: (authError as any).authError as AuthenticationError,
        };
      }
      const authError = this.createAuthError('INVALID_TOKEN', `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        valid: false,
        error: (authError as any).authError as AuthenticationError,
      };
    }
  }

  /**
   * Checks if token needs refresh (expires within 5 minutes)
   */
  isTokenExpiringSoon(expiresAt: Date): boolean {
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return expiresAt <= fiveMinutesFromNow;
  }

  /**
   * Cleans up server and auth state
   */
  private cleanup(): void {
    if (this.server) {
      this.server.close();
      delete this.server;
    }
    delete this.authPromise;
    delete this.authResolve;
    delete this.authReject;
    delete this.state;
  }

  /**
   * Creates standardized authentication error
   */
  private createAuthError(code: AuthenticationError['code'], message: string): Error {
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
   * Stops the OAuth server if running
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('OAuth server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}