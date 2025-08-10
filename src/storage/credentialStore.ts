/**
 * Encrypted Credential Store
 * 
 * Handles secure storage and retrieval of user credentials using KMS encryption
 */

import { getKMSService } from '../encryption/kmsService';
import { setupLogger } from '../utils/logger';
import { StoredCredentials } from '../types/oauth';

const logger = setupLogger();

export interface CredentialStoreOptions {
  useKMS?: boolean;
  fallbackToMemory?: boolean;
}

/**
 * Encrypted credential store with KMS integration
 */
export class CredentialStore {
  private kmsService: any = null; // Lazy-loaded
  private memoryStore: Map<string, StoredCredentials> = new Map();
  private options: CredentialStoreOptions;

  constructor(options: CredentialStoreOptions = {}) {
    this.options = {
      useKMS: true,
      fallbackToMemory: true,
      ...options
    };

    logger.info('Credential store initialized', {
      useKMS: this.options.useKMS,
      fallbackToMemory: this.options.fallbackToMemory
    });
  }

  /**
   * Get KMS service (lazy-loaded)
   */
  private getKMSService() {
    if (!this.kmsService && this.options.useKMS) {
      try {
        this.kmsService = getKMSService();
      } catch (error) {
        logger.warn('KMS service not available', { error: error instanceof Error ? error.message : 'Unknown error' });
        this.kmsService = null;
      }
    }
    return this.kmsService;
  }

  /**
   * Store encrypted credentials for a user
   */
  async storeCredentials(userId: string, credentials: StoredCredentials): Promise<void> {
    try {
      if (this.options.useKMS) {
        await this.storeWithKMS(userId, credentials);
      } else {
        await this.storeInMemory(userId, credentials);
      }

      logger.info('Credentials stored successfully', {
        userId,
        username: credentials.username,
        expiresAt: credentials.expiresAt,
        scopes: credentials.scopes.length
      });
    } catch (error) {
      logger.error('Failed to store credentials', { error, userId });
      
      if (this.options.fallbackToMemory && this.options.useKMS) {
        logger.warn('Falling back to memory storage', { userId });
        await this.storeInMemory(userId, credentials);
      } else {
        throw error;
      }
    }
  }

  /**
   * Retrieve and decrypt credentials for a user
   */
  async getCredentials(userId: string): Promise<StoredCredentials | null> {
    try {
      let credentials: StoredCredentials | null = null;

      if (this.options.useKMS) {
        credentials = await this.getFromKMS(userId);
      }

      // Fallback to memory if KMS fails or not configured
      if (!credentials && this.options.fallbackToMemory) {
        credentials = this.memoryStore.get(userId) || null;
      }

      if (credentials) {
        // Check if credentials are expired
        if (credentials.expiresAt && new Date() > credentials.expiresAt) {
          logger.warn('Credentials expired', { 
            userId, 
            expiresAt: credentials.expiresAt 
          });
          await this.deleteCredentials(userId);
          return null;
        }

        logger.debug('Credentials retrieved successfully', {
          userId,
          username: credentials.username,
          expiresAt: credentials.expiresAt
        });
      }

      return credentials;
    } catch (error) {
      logger.error('Failed to retrieve credentials', { error, userId });
      return null;
    }
  }

  /**
   * Delete credentials for a user
   */
  async deleteCredentials(userId: string): Promise<void> {
    try {
      // Remove from memory store
      this.memoryStore.delete(userId);

      // TODO: Remove from database when implemented
      
      logger.info('Credentials deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete credentials', { error, userId });
      throw error;
    }
  }

  /**
   * Update credentials (e.g., after token refresh)
   */
  async updateCredentials(userId: string, updates: Partial<StoredCredentials>): Promise<void> {
    try {
      const existing = await this.getCredentials(userId);
      if (!existing) {
        throw new Error('Credentials not found for user');
      }

      const updated: StoredCredentials = {
        ...existing,
        ...updates
      };

      await this.storeCredentials(userId, updated);
      
      logger.info('Credentials updated', { 
        userId, 
        updatedFields: Object.keys(updates) 
      });
    } catch (error) {
      logger.error('Failed to update credentials', { error, userId });
      throw error;
    }
  }

  /**
   * List all stored user IDs (for cleanup/maintenance)
   */
  async listUsers(): Promise<string[]> {
    try {
      return Array.from(this.memoryStore.keys());
    } catch (error) {
      logger.error('Failed to list users', { error });
      return [];
    }
  }

  /**
   * Clean up expired credentials
   */
  async cleanupExpiredCredentials(): Promise<number> {
    try {
      const now = new Date();
      const expiredUsers: string[] = [];

      for (const [userId, credentials] of this.memoryStore.entries()) {
        if (credentials.expiresAt && now > credentials.expiresAt) {
          expiredUsers.push(userId);
        }
      }

      for (const userId of expiredUsers) {
        await this.deleteCredentials(userId);
      }

      if (expiredUsers.length > 0) {
        logger.info('Cleaned up expired credentials', { 
          count: expiredUsers.length 
        });
      }

      return expiredUsers.length;
    } catch (error) {
      logger.error('Failed to cleanup expired credentials', { error });
      return 0;
    }
  }

  /**
   * Get store statistics
   */
  getStats(): { totalUsers: number; useKMS: boolean; memoryUsers: number } {
    return {
      totalUsers: this.memoryStore.size,
      useKMS: this.options.useKMS || false,
      memoryUsers: this.memoryStore.size
    };
  }

  /**
   * Store credentials using KMS encryption
   */
  private async storeWithKMS(userId: string, credentials: StoredCredentials): Promise<void> {
    try {
      // Create encryption context for additional security
      const encryptionContext = {
        userId,
        purpose: 'twitch-credentials',
        timestamp: Date.now().toString()
      };

      // Encrypt the credentials
      const kmsService = this.getKMSService();
      if (!kmsService) {
        throw new Error('KMS service not available');
      }
      
      const encryptedData = await kmsService.encryptJSON(credentials, encryptionContext);

      // TODO: Store in database
      // For now, store in memory with encrypted data
      this.memoryStore.set(userId, {
        ...credentials,
        // Mark as encrypted for identification
        accessToken: `encrypted:${encryptedData.substring(0, 50)}...`,
        refreshToken: 'encrypted'
      });

      logger.debug('Credentials encrypted with KMS', { 
        userId, 
        encryptedLength: encryptedData.length 
      });
    } catch (error) {
      logger.error('KMS encryption failed', { error, userId });
      throw new Error('Failed to encrypt credentials');
    }
  }

  /**
   * Retrieve credentials from KMS encryption
   */
  private async getFromKMS(userId: string): Promise<StoredCredentials | null> {
    try {
      // TODO: Retrieve encrypted data from database
      // For now, this is a placeholder
      return null;
    } catch (error) {
      logger.error('KMS decryption failed', { error, userId });
      return null;
    }
  }

  /**
   * Store credentials in memory (fallback/development)
   */
  private async storeInMemory(userId: string, credentials: StoredCredentials): Promise<void> {
    this.memoryStore.set(userId, credentials);
    logger.debug('Credentials stored in memory', { userId });
  }

  /**
   * Test KMS connectivity
   */
  async testKMSConnection(): Promise<boolean> {
    try {
      if (!this.options.useKMS) {
        return false;
      }

      const kmsService = this.getKMSService();
      if (!kmsService) {
        return false;
      }

      return await kmsService.testConnection();
    } catch (error) {
      logger.error('KMS connection test failed', { error });
      return false;
    }
  }
}

/**
 * Global credential store instance
 */
let credentialStoreInstance: CredentialStore | null = null;

export function getCredentialStore(options?: CredentialStoreOptions): CredentialStore {
  if (!credentialStoreInstance) {
    credentialStoreInstance = new CredentialStore(options);
  }
  return credentialStoreInstance;
}

/**
 * Initialize credential store with cleanup timer
 */
export function initializeCredentialStore(options?: CredentialStoreOptions): CredentialStore {
  const store = getCredentialStore(options);
  
  // Start cleanup timer (every 30 minutes)
  setInterval(async () => {
    try {
      await store.cleanupExpiredCredentials();
    } catch (error) {
      logger.error('Credential cleanup timer failed', { error });
    }
  }, 30 * 60 * 1000);

  logger.info('Credential store cleanup timer started');
  return store;
}
