/**
 * AWS KMS Encryption Service
 * 
 * Provides secure encryption/decryption for sensitive data using AWS KMS
 */

import { KMSClient, EncryptCommand, DecryptCommand, DescribeKeyCommand } from '@aws-sdk/client-kms';
import { setupLogger } from '../utils/logger';

const logger = setupLogger();

export interface KMSEncryptionResult {
  encryptedData: string;
  keyId: string;
  encryptionContext?: Record<string, string>;
}

export interface KMSDecryptionResult {
  decryptedData: string;
  keyId: string;
  encryptionContext?: Record<string, string>;
}

/**
 * KMS Service for encrypting/decrypting sensitive data
 */
export class KMSService {
  private client: KMSClient;
  private keyId: string;

  constructor(keyId: string, region?: string) {
    this.keyId = keyId;
    this.client = new KMSClient({ 
      region: region || process.env.AWS_REGION || 'us-east-1' 
    });

    logger.info('KMS service initialized', { 
      keyId: keyId.substring(0, 8) + '...', 
      region: region || process.env.AWS_REGION || 'us-east-1' 
    });
  }

  /**
   * Encrypt a JSON object using KMS
   */
  async encryptJSON(data: any, encryptionContext?: Record<string, string>): Promise<string> {
    try {
      const plaintext = JSON.stringify(data);
      const result = await this.encrypt(plaintext, encryptionContext);
      return result.encryptedData;
    } catch (error) {
      logger.error('Failed to encrypt JSON data', { error });
      throw new Error('JSON encryption failed');
    }
  }

  /**
   * Decrypt a JSON object using KMS
   */
  async decryptJSON<T = any>(encryptedData: string, encryptionContext?: Record<string, string>): Promise<T> {
    try {
      const result = await this.decrypt(encryptedData, encryptionContext);
      return JSON.parse(result.decryptedData);
    } catch (error) {
      logger.error('Failed to decrypt JSON data', { error });
      throw new Error('JSON decryption failed');
    }
  }

  /**
   * Encrypt data using KMS
   */
  async encrypt(plaintext: string, encryptionContext?: Record<string, string>): Promise<KMSEncryptionResult> {
    try {
      const command = new EncryptCommand({
        KeyId: this.keyId,
        Plaintext: Buffer.from(plaintext, 'utf-8'),
        EncryptionContext: encryptionContext
      });

      const response = await this.client.send(command);
      
      if (!response.CiphertextBlob) {
        throw new Error('No encrypted data returned from KMS');
      }

      const encryptedData = Buffer.from(response.CiphertextBlob).toString('base64');

      logger.debug('Data encrypted successfully', {
        keyId: response.KeyId?.substring(0, 8) + '...',
        encryptedLength: encryptedData.length,
        hasContext: !!encryptionContext
      });

      return {
        encryptedData,
        keyId: response.KeyId || this.keyId,
        ...(encryptionContext && { encryptionContext })
      };
    } catch (error) {
      logger.error('KMS encryption failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        keyId: this.keyId.substring(0, 8) + '...'
      });
      throw new Error('KMS encryption failed');
    }
  }

  /**
   * Decrypt data using KMS
   */
  async decrypt(encryptedData: string, encryptionContext?: Record<string, string>): Promise<KMSDecryptionResult> {
    try {
      const ciphertextBlob = Buffer.from(encryptedData, 'base64');
      
      const command = new DecryptCommand({
        CiphertextBlob: ciphertextBlob,
        EncryptionContext: encryptionContext
      });

      const response = await this.client.send(command);
      
      if (!response.Plaintext) {
        throw new Error('No decrypted data returned from KMS');
      }

      const decryptedData = Buffer.from(response.Plaintext).toString('utf-8');

      logger.debug('Data decrypted successfully', {
        keyId: response.KeyId?.substring(0, 8) + '...',
        decryptedLength: decryptedData.length,
        hasContext: !!encryptionContext
      });

      return {
        decryptedData,
        keyId: response.KeyId || this.keyId
      };
    } catch (error) {
      logger.error('KMS decryption failed', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('KMS decryption failed');
    }
  }

  /**
   * Test KMS connectivity and permissions
   */
  async testConnection(): Promise<boolean> {
    try {
      const command = new DescribeKeyCommand({
        KeyId: this.keyId
      });

      const response = await this.client.send(command);
      
      logger.debug('KMS connection test successful', {
        keyId: response.KeyMetadata?.KeyId?.substring(0, 8) + '...',
        keyState: response.KeyMetadata?.KeyState
      });

      return response.KeyMetadata?.KeyState === 'Enabled';
    } catch (error) {
      logger.error('KMS connection test failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        keyId: this.keyId.substring(0, 8) + '...'
      });
      return false;
    }
  }

  /**
   * Get key information
   */
  async getKeyInfo(): Promise<any> {
    try {
      const command = new DescribeKeyCommand({
        KeyId: this.keyId
      });

      const response = await this.client.send(command);
      return response.KeyMetadata;
    } catch (error) {
      logger.error('Failed to get key info', { error });
      throw new Error('Failed to get key information');
    }
  }
}

// Singleton instance
let kmsServiceInstance: KMSService | null = null;

/**
 * Get or create KMS service instance
 */
export function getKMSService(): KMSService | null {
  const keyId = process.env.KMS_KEY_ID;
  
  if (!keyId) {
    logger.warn('KMS_KEY_ID not configured, KMS service unavailable');
    return null;
  }

  if (!kmsServiceInstance) {
    try {
      kmsServiceInstance = new KMSService(keyId, process.env.AWS_REGION);
      logger.info('KMS service instance created');
    } catch (error) {
      logger.error('Failed to create KMS service instance', { error });
      return null;
    }
  }

  return kmsServiceInstance;
}

/**
 * Reset KMS service instance (for testing)
 */
export function resetKMSService(): void {
  kmsServiceInstance = null;
  logger.debug('KMS service instance reset');
}
