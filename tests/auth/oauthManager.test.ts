import { OAuthManager } from '@/auth/oauthManager';
import { OAuthConfig } from '@/types';

// Mock dependencies
jest.mock('express', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    use: jest.fn(),
    get: jest.fn(),
    listen: jest.fn((port, host, callback) => {
      callback();
      return { on: jest.fn(), close: jest.fn() };
    }),
  })),
}));

jest.mock('open', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
  isAxiosError: jest.fn(),
}));

const mockConfig: OAuthConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3000/callback',
  scopes: ['chat:read', 'chat:edit'],
};

describe('OAuthManager', () => {
  let oauthManager: OAuthManager;

  beforeEach(() => {
    oauthManager = new OAuthManager(mockConfig);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await oauthManager.stop();
  });

  describe('constructor', () => {
    it('should create OAuthManager with config', () => {
      expect(oauthManager).toBeInstanceOf(OAuthManager);
    });
  });

  describe('refreshToken', () => {
    it('should be implemented and not throw placeholder error', async () => {
      // The method should be implemented and not throw the placeholder error
      // We expect it to throw a different error (like network error) instead
      await expect(oauthManager.refreshToken('test-refresh-token')).rejects.not.toThrow(
        'Not implemented yet - will be implemented in task 2.2'
      );
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('should return true for tokens expiring within 5 minutes', () => {
      const expiringDate = new Date(Date.now() + 4 * 60 * 1000); // 4 minutes from now
      const result = oauthManager.isTokenExpiringSoon(expiringDate);
      expect(result).toBe(true);
    });

    it('should return false for tokens expiring after 5 minutes', () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      const result = oauthManager.isTokenExpiringSoon(futureDate);
      expect(result).toBe(false);
    });
  });

  describe('stop', () => {
    it('should stop server gracefully', async () => {
      await expect(oauthManager.stop()).resolves.not.toThrow();
    });
  });
});