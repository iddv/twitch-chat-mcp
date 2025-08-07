import { 
  startChatRecording, 
  stopChatRecording, 
  createPersistentChatHistory,
  startAnalyticsProcessing,
  cleanupChatResources
} from '@/mcp/chatResources';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Chat Resources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock fs operations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('{"messages": [], "totalMessages": 0}');
    mockFs.readdir.mockResolvedValue(['test1.json', 'test2.json'] as any);
  });

  afterEach(() => {
    cleanupChatResources();
  });

  describe('Chat Recording', () => {
    it('should start chat recording successfully', () => {
      const sessionId = startChatRecording('testchannel');
      
      expect(sessionId).toBe('testchannel');
    });

    it('should stop chat recording successfully', () => {
      // Start recording first
      startChatRecording('testchannel');
      
      // Then stop it
      const stopped = stopChatRecording('testchannel');
      
      expect(stopped).toBe(true);
    });

    it('should return false when stopping non-existent recording', () => {
      const stopped = stopChatRecording('nonexistent');
      expect(stopped).toBe(false);
    });
  });

  describe('Persistent Chat History', () => {
    it('should create persistent chat history successfully', async () => {
      const messages = [
        {
          username: 'testuser',
          message: 'Hello world!',
          timestamp: new Date().toISOString(),
          badges: ['subscriber']
        }
      ];

      const linkId = await createPersistentChatHistory('testchannel', 'test_session', messages);
      
      expect(linkId).toMatch(/^testchannel-test_session-\d+$/);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle empty message arrays', async () => {
      const linkId = await createPersistentChatHistory('testchannel', 'empty_session', []);
      
      expect(linkId).toMatch(/^testchannel-empty_session-\d+$/);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle file write errors', async () => {
      mockFs.writeFile.mockRejectedValueOnce(new Error('Write failed'));

      const messages = [
        {
          username: 'testuser',
          message: 'Hello world!',
          timestamp: new Date().toISOString(),
          badges: []
        }
      ];

      await expect(
        createPersistentChatHistory('testchannel', 'test_session', messages)
      ).rejects.toThrow('Write failed');
    });
  });

  describe('Analytics Processing', () => {
    it('should start analytics processing successfully', () => {
      const taskId = startAnalyticsProcessing('testchannel', 'last_hour');
      
      expect(taskId).toMatch(/^analytics-testchannel-\d+-\d+$/);
    });

    it('should create unique task IDs for same channel', () => {
      const taskId1 = startAnalyticsProcessing('testchannel', 'session1');
      const taskId2 = startAnalyticsProcessing('testchannel', 'session2');
      
      expect(taskId1).not.toBe(taskId2);
      expect(taskId1).toMatch(/^analytics-testchannel-\d+-\d+$/);
      expect(taskId2).toMatch(/^analytics-testchannel-\d+-\d+$/);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage directory creation failure', async () => {
      mockFs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      // Should not throw, just log the error
      const messages = [
        {
          username: 'testuser',
          message: 'Hello world!',
          timestamp: new Date().toISOString(),
          badges: []
        }
      ];

      // The function should still attempt to create the history
      await expect(
        createPersistentChatHistory('testchannel', 'test_session', messages)
      ).resolves.toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all resources', () => {
      // Start some sessions
      startChatRecording('channel1');
      startChatRecording('channel2');
      startAnalyticsProcessing('channel3', 'test');
      
      // Cleanup should not throw
      expect(() => cleanupChatResources()).not.toThrow();
    });
  });
});