/**
 * Credential Store
 * 
 * Handles secure storage and retrieval of user credentials
 */

import { setupLogger } from '../utils/logger';
import { StoredCredentials } from '../types/oauth';

const logger = setupLogger();

export interface CredentialStoreOptions {
  fallbackToMemory?: boolean;
}

/**
 * Credential store with memory storage
 */
export class CredentialStore {
  private memoryStore: Map<string, StoredCredentials> = new Map();
  private options: CredentialStoreOptions;

  constructor(options: CredentialStoreOptions = {}) {
    this.options = {
      fallbackToMemory: true,
      ...options
    };

    logger.info('Credential store initialized', {
      fallbackToMemory: this.options.fallbackToMemory
    });
  }

  /**
   * Store credentials for a user
   */
  async storeCredentials(userId: string, credentials: StoredCredentials): Promise<void> {
    try {
      this.memoryStore.set(userId, credentials);

      logger.info('Credentials stored successfully', {
        userId,
        username: credentials.username,
        expiresAt: credentials.expiresAt,
        scopes: credentials.scopes.length
      });
    } catch (error) {
      logger.error('Failed to store credentials', { error, userId });
      throw error;
    }
  }

  /**
   * Retrieve credentials for a user
   */
  async getCredentials(userId: string): Promise<StoredCredentials | null> {
    try {
      const credentials = this.memoryStore.get(userId) || null;

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
  getStats(): { totalUsers: number; memoryUsers: number } {
    return {
      totalUsers: this.memoryStore.size,
      memoryUsers: this.memoryStore.size
    };
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
