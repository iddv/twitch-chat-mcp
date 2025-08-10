/**
 * AWS KMS Encryption Service
 * 
 * Handles encryption and decryption of sensitive data using AWS KMS
 */

import { KmsKeyringNode, buildClient, CommitmentPolicy } from '@aws-crypto/client-node';
import { setupLogger } from '../utils/logger';

const logger = setupLogger();

export class KMSService {
  private keyring: KmsKeyringNode | null = null;
  private isInitialized: boolean = false;

  constructor(private kmsKeyId: string) {
    if (!kmsKeyId) {
      throw new Error('KMS Key ID is required');
    }
  }

  /**
   * Initialize the KMS keyring
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.keyring = new KmsKeyringNode({ 
        keyIds: [this.kmsKeyId],
        // Optional: specify AWS region if different from default
        // region: process.env.AWS_REGION || 'us-east-1'
      });
      
      this.isInitialized = true;
      logger.info('KMS service initialized successfully', { 
        keyId: this.kmsKeyId.substring(0, 20) + '...' 
      });
    } catch (error) {
      logger.error('Failed to initialize KMS service', { error });
      throw new Error('KMS initialization failed');
    }
  }

  /**
   * Encrypt sensitive data
   */
  async encryptData(plaintext: string, context?: Record<string, string>): Promise<string> {
    await this.initialize();

    try {
      const encryptionContext = {
        purpose: 'twitch-credentials',
        ...context
      };

      const { encrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT);
      const { result } = await encrypt(this.keyring!, plaintext, {
        encryptionContext
      });

      // Convert to base64 for storage
      const encryptedBase64 = Buffer.from(result).toString('base64');
      
      logger.debug('Data encrypted successfully', { 
        contextKeys: Object.keys(encryptionContext),
        encryptedLength: encryptedBase64.length 
      });

      return encryptedBase64;
    } catch (error) {
      logger.error('Failed to encrypt data', { error });
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decryptData(encryptedBase64: string, expectedContext?: Record<string, string>): Promise<string> {
    await this.initialize();

    try {
      // Convert from base64
      const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');

      const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT);
      const { plaintext, messageHeader } = await decrypt(this.keyring!, encryptedBuffer);

      // Verify encryption context if provided
      if (expectedContext) {
        const actualContext = messageHeader.encryptionContext;
        for (const [key, expectedValue] of Object.entries(expectedContext)) {
          if (actualContext[key] !== expectedValue) {
            throw new Error(`Encryption context mismatch for key: ${key}`);
          }
        }
      }

      const decryptedText = plaintext.toString('utf8');
      
      logger.debug('Data decrypted successfully', { 
        contextKeys: Object.keys(messageHeader.encryptionContext),
        plaintextLength: decryptedText.length 
      });

      return decryptedText;
    } catch (error) {
      logger.error('Failed to decrypt data', { error });
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt JSON object
   */
  async encryptJSON<T>(data: T, context?: Record<string, string>): Promise<string> {
    const jsonString = JSON.stringify(data);
    return this.encryptData(jsonString, context);
  }

  /**
   * Decrypt JSON object
   */
  async decryptJSON<T>(encryptedData: string, expectedContext?: Record<string, string>): Promise<T> {
    const jsonString = await this.decryptData(encryptedData, expectedContext);
    return JSON.parse(jsonString);
  }

  /**
   * Test KMS connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const testData = 'test-connection-' + Date.now();
      const encrypted = await this.encryptData(testData);
      const decrypted = await this.decryptData(encrypted);
      
      const success = decrypted === testData;
      logger.info('KMS connection test', { success });
      
      return success;
    } catch (error) {
      logger.error('KMS connection test failed', { error });
      return false;
    }
  }
}

/**
 * Create KMS service instance
 */
export function createKMSService(): KMSService {
  const kmsKeyId = process.env.KMS_KEY_ID;
  
  if (!kmsKeyId) {
    throw new Error('KMS_KEY_ID environment variable is required');
  }

  return new KMSService(kmsKeyId);
}

/**
 * Global KMS service instance (lazy-loaded)
 */
let kmsServiceInstance: KMSService | null = null;

export function getKMSService(): KMSService {
  if (!kmsServiceInstance) {
    kmsServiceInstance = createKMSService();
  }
  return kmsServiceInstance;
}
