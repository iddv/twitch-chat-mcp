import { 
  startStreamMonitoring, 
  stopStreamMonitoring, 
  createPersistentStreamLink,
  getMonitoringStatus,
  setTwitchClient,
  cleanup
} from '@/mcp/resources';
import { TwitchAPIClient } from '@/twitch/apiClient';

// Mock TwitchAPIClient
const mockTwitchClient = {
  getStreamInfo: jest.fn(),
  getChannelInfo: jest.fn(),
  getMultipleStreamsInfo: jest.fn(),
  getQueueStatus: jest.fn(() => ({ pending: 0, processing: false }))
} as unknown as TwitchAPIClient;

describe('Stream Resources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTwitchClient(mockTwitchClient);
  });

  afterEach(() => {
    // Clean up all resources and intervals
    cleanup();
  });

  afterAll(() => {
    // Final cleanup
    cleanup();
  });

  describe('Stream Monitoring', () => {
    it('should start stream monitoring successfully', () => {
      const sessionId = startStreamMonitoring('testchannel', 10000);
      
      expect(sessionId).toBe('testchannel');
      
      const status = getMonitoringStatus();
      expect(status.activeSessions).toBe(1);
    });

    it('should stop stream monitoring successfully', () => {
      // Start monitoring first
      startStreamMonitoring('testchannel', 10000);
      
      // Then stop it
      const stopped = stopStreamMonitoring('testchannel');
      
      expect(stopped).toBe(true);
      
      const status = getMonitoringStatus();
      expect(status.activeSessions).toBe(0);
    });

    it('should return false when stopping non-existent monitoring', () => {
      const stopped = stopStreamMonitoring('nonexistent');
      expect(stopped).toBe(false);
    });

    it('should replace existing monitoring session for same channel', () => {
      // Start first session
      const sessionId1 = startStreamMonitoring('testchannel', 10000);
      expect(sessionId1).toBe('testchannel');
      
      let status = getMonitoringStatus();
      expect(status.activeSessions).toBe(1);
      
      // Start second session for same channel
      const sessionId2 = startStreamMonitoring('testchannel', 5000);
      expect(sessionId2).toBe('testchannel');
      
      // Should still have only 1 session
      status = getMonitoringStatus();
      expect(status.activeSessions).toBe(1);
    });
  });

  describe('Persistent Stream Links', () => {
    it('should create persistent stream link successfully', () => {
      const linkId = createPersistentStreamLink('testchannel');
      
      expect(linkId).toMatch(/^testchannel-\d+$/);
      
      const status = getMonitoringStatus();
      expect(status.persistentLinks).toBe(1);
    });

    it('should create unique link IDs for same channel', () => {
      const linkId1 = createPersistentStreamLink('testchannel');
      const linkId2 = createPersistentStreamLink('testchannel');
      
      expect(linkId1).not.toBe(linkId2);
      expect(linkId1).toMatch(/^testchannel-\d+$/);
      expect(linkId2).toMatch(/^testchannel-\d+$/);
      
      const status = getMonitoringStatus();
      expect(status.persistentLinks).toBe(2);
    });
  });

  describe('Monitoring Status', () => {
    it('should return correct status with no active sessions', () => {
      const status = getMonitoringStatus();
      
      expect(status.activeSessions).toBe(0);
      expect(status.persistentLinks).toBe(0);
      expect(status.totalCacheKeys).toBe(0);
      expect(status.cacheStats).toBeDefined();
    });

    it('should return correct status with active sessions and links', () => {
      startStreamMonitoring('channel1', 10000);
      startStreamMonitoring('channel2', 15000);
      createPersistentStreamLink('channel3');
      
      const status = getMonitoringStatus();
      
      expect(status.activeSessions).toBe(2);
      expect(status.persistentLinks).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle minimum update interval validation', () => {
      // This should work fine as the validation is in the tools layer
      const sessionId = startStreamMonitoring('testchannel', 1000);
      expect(sessionId).toBe('testchannel');
    });

    it('should handle empty channel names gracefully', () => {
      const sessionId = startStreamMonitoring('', 10000);
      expect(sessionId).toBe('');
    });
  });
});