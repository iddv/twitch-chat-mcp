import * as fs from 'fs/promises';
import * as path from 'path';
import { TokenStorage } from '@/auth/tokenStorage';
import { TwitchTokens } from '@/types';

// Mock fs module
jest.mock('fs/promises');

const mockTokens: TwitchTokens = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: new Date('2024-12-31T23:59:59Z'),
  scopes: ['chat:read', 'chat:edit'],
  username: 'testuser',
};

describe('TokenStorage', () => {
  let tokenStorage: TokenStorage;
  let tempDir: string;

  beforeEach(() => {
    tempDir = '/tmp/test-tokens';
    tokenStorage = new TokenStorage(path.join(tempDir, 'tokens.json'));
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create TokenStorage with custom path', () => {
      expect(tokenStorage).toBeInstanceOf(TokenStorage);
    });

    it('should use default path when none provided', () => {
      const defaultStorage = new TokenStorage();
      expect(defaultStorage).toBeInstanceOf(TokenStorage);
    });
  });

  describe('hasTokens', () => {
    it('should return true when token file exists', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      
      const result = await tokenStorage.hasTokens();
      
      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(path.join(tempDir, 'tokens.json'));
    });

    it('should return false when token file does not exist', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      
      const result = await tokenStorage.hasTokens();
      
      expect(result).toBe(false);
    });
  });

  describe('clearTokens', () => {
    it('should remove token file successfully', async () => {
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);
      
      await tokenStorage.clearTokens();
      
      expect(fs.unlink).toHaveBeenCalledWith(path.join(tempDir, 'tokens.json'));
    });

    it('should handle file not found error gracefully', async () => {
      const error = new Error('ENOENT') as any;
      error.code = 'ENOENT';
      (fs.unlink as jest.Mock).mockRejectedValue(error);
      
      await expect(tokenStorage.clearTokens()).resolves.not.toThrow();
    });

    it('should throw on other errors', async () => {
      (fs.unlink as jest.Mock).mockRejectedValue(new Error('Permission denied'));
      
      await expect(tokenStorage.clearTokens()).rejects.toThrow('Failed to clear tokens');
    });
  });
});