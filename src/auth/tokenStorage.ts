import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { TwitchTokens } from '../types';
import { logger } from '../utils';

interface EncryptedTokenData {
  iv: string;
  encryptedData: string;
  authTag: string;
}

export class TokenStorage {
  private readonly tokenFilePath: string;
  private readonly algorithm = 'aes-256-gcm';
  private encryptionKey?: Buffer;

  constructor(tokenFilePath?: string) {
    // Default to storing tokens in user's home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
    const defaultPath = path.join(homeDir, '.twitch-mcp', 'tokens.json');
    this.tokenFilePath = tokenFilePath || defaultPath;
  }

  /**
   * Saves tokens with encryption at rest
   */
  async saveTokens(tokens: TwitchTokens): Promise<void> {
    try {
      // Ensure directory exists
      await this.ensureDirectoryExists();

      // Get or generate encryption key
      const key = await this.getEncryptionKey();

      // Encrypt token data
      const encryptedData = this.encryptData(JSON.stringify(tokens), key);

      // Save encrypted data to file
      await fs.writeFile(this.tokenFilePath, JSON.stringify(encryptedData, null, 2), {
        mode: 0o600, // Read/write for owner only
      });

      logger.info('Tokens saved successfully');
    } catch (error) {
      logger.error('Failed to save tokens:', error);
      throw new Error(`Failed to save tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Loads and decrypts tokens from storage
   */
  async loadTokens(): Promise<TwitchTokens | null> {
    try {
      // Check if token file exists
      try {
        await fs.access(this.tokenFilePath);
      } catch {
        logger.debug('No token file found');
        return null;
      }

      // Read encrypted data
      const fileContent = await fs.readFile(this.tokenFilePath, 'utf-8');
      const encryptedData: EncryptedTokenData = JSON.parse(fileContent);

      // Get encryption key
      const key = await this.getEncryptionKey();

      // Decrypt data
      const decryptedData = this.decryptData(encryptedData, key);
      const tokens: TwitchTokens = JSON.parse(decryptedData);

      // Convert expiresAt back to Date object
      tokens.expiresAt = new Date(tokens.expiresAt);

      logger.debug('Tokens loaded successfully');
      return tokens;
    } catch (error) {
      logger.error('Failed to load tokens:', error);
      // If we can't decrypt, the tokens are corrupted - clear them
      await this.clearTokens();
      return null;
    }
  }

  /**
   * Clears stored tokens
   */
  async clearTokens(): Promise<void> {
    try {
      await fs.unlink(this.tokenFilePath);
      logger.info('Tokens cleared successfully');
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.error('Failed to clear tokens:', error);
        throw new Error(`Failed to clear tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      // File doesn't exist, which is fine
      logger.debug('No token file to clear');
    }
  }

  /**
   * Checks if tokens exist in storage
   */
  async hasTokens(): Promise<boolean> {
    try {
      await fs.access(this.tokenFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensures the token directory exists
   */
  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.tokenFilePath);
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    } catch (error) {
      logger.error('Failed to create token directory:', error);
      throw new Error(`Failed to create token directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets or generates encryption key
   */
  private async getEncryptionKey(): Promise<Buffer> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    const keyPath = path.join(path.dirname(this.tokenFilePath), '.key');
    
    try {
      // Try to load existing key
      const keyData = await fs.readFile(keyPath);
      this.encryptionKey = keyData;
      return this.encryptionKey;
    } catch {
      // Generate new key
      this.encryptionKey = crypto.randomBytes(32);
      
      // Save key with restricted permissions
      await fs.writeFile(keyPath, this.encryptionKey, {
        mode: 0o600, // Read/write for owner only
      });
      
      logger.debug('Generated new encryption key');
      return this.encryptionKey;
    }
  }

  /**
   * Encrypts data using AES-256-GCM
   */
  private encryptData(data: string, key: Buffer): EncryptedTokenData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      encryptedData: encrypted,
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypts data using AES-256-GCM
   */
  private decryptData(encryptedData: EncryptedTokenData, key: Buffer): string {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipher(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}