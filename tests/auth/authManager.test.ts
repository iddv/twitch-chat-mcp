// Mock dependencies before importing
jest.mock('@/auth/oauthManager', () => ({
  OAuthManager: jest.fn().mockImplementation(() => ({
    authenticate: jest.fn(),
    refreshToken: jest.fn(),
    validateToken: jest.fn(),
    isTokenExpiringSoon: jest.fn(),
    stop: jest.fn(),
  })),
}));

jest.mock('@/auth/tokenStorage', () => ({
  TokenStorage: jest.fn().mockImplementation(() => ({
    saveTokens: jest.fn(),
    loadTokens: jest.fn(),
    clearTokens: jest.fn(),
    hasTokens: jest.fn(),
  })),
}));

import { AuthManager } from '@/auth/authManager';
import { OAuthManager } from '@/auth/oauthManager';
import { TokenStorage } from '@/auth/tokenStorage';
import { OAuthConfig, TwitchTokens } from '@/types';

const mockConfig: OAuthConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3000/callback',
  scopes: ['chat:read', 'chat:edit'],
};

const mockTokens: TwitchTokens = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
  scopes: ['chat:read', 'chat:edit'],
  username: 'testuser',
};

const mockExpiredTokens: TwitchTokens = {
  ...mockTokens,
  expiresAt: new Date(Date.now() + 60000), // 1 minute from now (expiring soon)
};

describe('AuthManager', () => {
  let authManager: AuthManager;
  let mockOAuthManager: jest.Mocked<OAuthManager>;
  let mockTokenStorage: jest.Mocked<TokenStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mocked instances
    mockOAuthManager = new OAuthManager(mockConfig) as jest.Mocked<OAuthManager>;
    mockTokenStorage = new TokenStorage() as jest.Mocked<TokenStorage>;
    
    // Mock the constructors to return our mocked instances
    (OAuthManager as jest.MockedClass<typeof OAuthManager>).mockImplementation(() => mockOAuthManager);
    (TokenStorage as jest.MockedClass<typeof TokenStorage>).mockImplementation(() => mockTokenStorage);
    
    authManager = new AuthManager(mockConfig);
  });

  afterEach(async () => {
    await authManager.stop();
  });

  describe('constructor', () => {
    it('should create AuthManager with config', () => {
      expect(authManager).toBeInstanceOf(AuthManager);
      expect(OAuthManager).toHaveBeenCalledWith(mockConfig);
      expect(TokenStorage).toHaveBeenCalledWith(undefined);
    });

    it('should create AuthManager with custom token storage path', () => {
      const customPath = '/custom/path/tokens.json';
      new AuthManager(mockConfig, customPath);
      expect(TokenStorage).toHaveBeenCalledWith(customPath);
    });
  });

  describe('hasAuthentication', () => {
    it('should return true when tokens exist in storage', async () => {
      mockTokenStorage.hasTokens.mockResolvedValue(true);
      
      const result = await authManager.hasAuthentication();
      
      expect(result).toBe(true);
      expect(mockTokenStorage.hasTokens).toHaveBeenCalled();
    });

    it('should return false when no tokens exist', async () => {
      mockTokenStorage.hasTokens.mockResolvedValue(false);
      
      const result = await authManager.hasAuthentication();
      
      expect(result).toBe(false);
    });
  });

  describe('getValidToken', () => {
    it('should load tokens from storage when no current tokens', async () => {
      mockTokenStorage.loadTokens.mockResolvedValue(mockTokens);
      mockOAuthManager.isTokenExpiringSoon.mockReturnValue(false);
      
      const result = await authManager.getValidToken();
      
      expect(result).toEqual(mockTokens);
      expect(mockTokenStorage.loadTokens).toHaveBeenCalled();
      expect(mockOAuthManager.isTokenExpiringSoon).toHaveBeenCalledWith(mockTokens.expiresAt);
    });

    it('should start OAuth flow when no tokens available', async () => {
      mockTokenStorage.loadTokens.mockResolvedValue(null);
      mockOAuthManager.authenticate.mockResolvedValue(mockTokens);
      mockTokenStorage.saveTokens.mockResolvedValue();
      
      const result = await authManager.getValidToken();
      
      expect(result).toEqual(mockTokens);
      expect(mockOAuthManager.authenticate).toHaveBeenCalled();
      expect(mockTokenStorage.saveTokens).toHaveBeenCalledWith(mockTokens);
    });

    it('should refresh tokens when they are expiring soon', async () => {
      mockTokenStorage.loadTokens.mockResolvedValue(mockExpiredTokens);
      mockOAuthManager.isTokenExpiringSoon.mockReturnValue(true);
      mockOAuthManager.refreshToken.mockResolvedValue(mockTokens);
      mockTokenStorage.saveTokens.mockResolvedValue();
      
      const result = await authManager.getValidToken();
      
      expect(result).toEqual(mockTokens);
      expect(mockOAuthManager.refreshToken).toHaveBeenCalledWith(mockExpiredTokens.refreshToken);
      expect(mockTokenStorage.saveTokens).toHaveBeenCalledWith(mockTokens);
    });
  });

  describe('authenticate', () => {
    it('should authenticate and save tokens', async () => {
      mockOAuthManager.authenticate.mockResolvedValue(mockTokens);
      mockTokenStorage.saveTokens.mockResolvedValue();
      
      const result = await authManager.authenticate();
      
      expect(result).toEqual(mockTokens);
      expect(mockOAuthManager.authenticate).toHaveBeenCalled();
      expect(mockTokenStorage.saveTokens).toHaveBeenCalledWith(mockTokens);
    });

    it('should throw error when authentication fails', async () => {
      const error = new Error('Authentication failed');
      mockOAuthManager.authenticate.mockRejectedValue(error);
      
      await expect(authManager.authenticate()).rejects.toThrow('Authentication failed');
    });
  });

  describe('getCurrentUser', () => {
    it('should return null when no current tokens', () => {
      const result = authManager.getCurrentUser();
      expect(result).toBeNull();
    });

    it('should return user info when tokens exist', async () => {
      mockTokenStorage.loadTokens.mockResolvedValue(mockTokens);
      mockOAuthManager.isTokenExpiringSoon.mockReturnValue(false);
      
      await authManager.getValidToken(); // Load tokens
      
      const result = authManager.getCurrentUser();
      expect(result).toEqual({
        username: mockTokens.username,
        scopes: mockTokens.scopes,
      });
    });
  });

  describe('clearAuthentication', () => {
    it('should clear tokens and stop OAuth manager', async () => {
      mockTokenStorage.clearTokens.mockResolvedValue();
      mockOAuthManager.stop.mockResolvedValue();
      
      await authManager.clearAuthentication();
      
      expect(mockTokenStorage.clearTokens).toHaveBeenCalled();
      expect(mockOAuthManager.stop).toHaveBeenCalled();
    });
  });

  describe('validateCurrentToken', () => {
    it('should return false when no current tokens', async () => {
      const result = await authManager.validateCurrentToken();
      expect(result).toBe(false);
    });

    it('should validate current token', async () => {
      mockTokenStorage.loadTokens.mockResolvedValue(mockTokens);
      mockOAuthManager.isTokenExpiringSoon.mockReturnValue(false);
      mockOAuthManager.validateToken.mockResolvedValue({ valid: true });
      
      await authManager.getValidToken(); // Load tokens
      
      const result = await authManager.validateCurrentToken();
      expect(result).toBe(true);
      expect(mockOAuthManager.validateToken).toHaveBeenCalledWith(mockTokens.accessToken);
    });
  });
});