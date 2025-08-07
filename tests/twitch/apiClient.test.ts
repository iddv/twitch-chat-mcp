import { TwitchAPIClient } from '../../src/twitch/apiClient';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TwitchAPIClient', () => {
  let apiClient: TwitchAPIClient;
  const mockClientId = 'test-client-id';
  const mockAccessToken = 'test-access-token';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Mock axios.create
    const mockAxiosInstance = {
      get: jest.fn(),
      defaults: {
        headers: {}
      },
      interceptors: {
        response: {
          use: jest.fn()
        }
      }
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    
    apiClient = new TwitchAPIClient(mockClientId, mockAccessToken);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.twitch.tv/helix',
        headers: {
          'Client-ID': mockClientId,
          'Authorization': `Bearer ${mockAccessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
    });

    it('should handle oauth: prefix in token', () => {
      const tokenWithPrefix = 'oauth:test-token';
      new TwitchAPIClient(mockClientId, tokenWithPrefix);
      
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });
  });

  describe('getStreamInfo', () => {
    it('should return stream info for live channel', async () => {
      const mockStreamData = {
        data: [{
          id: '123',
          user_id: '456',
          user_login: 'testchannel',
          user_name: 'TestChannel',
          game_id: '789',
          game_name: 'Test Game',
          type: 'live',
          title: 'Test Stream',
          viewer_count: 100,
          started_at: '2023-01-01T00:00:00Z',
          language: 'en',
          thumbnail_url: 'https://example.com/thumb.jpg',
          tag_ids: [],
          is_mature: false
        }]
      };

      // Mock the queued request
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ data: mockStreamData });

      // Start the request
      const resultPromise = apiClient.getStreamInfo('testchannel');
      
      // Advance timers to process queue
      jest.advanceTimersByTime(200);

      const result = await resultPromise;

      expect(result).toEqual({
        channelName: 'testchannel',
        isLive: true,
        title: 'Test Stream',
        game: 'Test Game',
        viewerCount: 100,
        startedAt: new Date('2023-01-01T00:00:00Z'),
        language: 'en'
      });
    });

    it('should return offline status for non-live channel', async () => {
      const mockStreamData = { data: [] };

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ data: mockStreamData });

      const resultPromise = apiClient.getStreamInfo('offlinechannel');
      
      // Advance timers to process queue
      jest.advanceTimersByTime(200);

      const result = await resultPromise;

      expect(result).toEqual({
        channelName: 'offlinechannel',
        isLive: false
      });
    });
  });

  describe('getMultipleStreamsInfo', () => {
    it('should handle empty channel list', async () => {
      const result = await apiClient.getMultipleStreamsInfo([]);
      expect(result).toEqual([]);
    });

    it('should return mixed live and offline channels', async () => {
      const mockStreamData = {
        data: [{
          id: '123',
          user_id: '456',
          user_login: 'livechannel',
          user_name: 'LiveChannel',
          game_id: '789',
          game_name: 'Test Game',
          type: 'live',
          title: 'Live Stream',
          viewer_count: 50,
          started_at: '2023-01-01T00:00:00Z',
          language: 'en',
          thumbnail_url: 'https://example.com/thumb.jpg',
          tag_ids: [],
          is_mature: false
        }]
      };

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ data: mockStreamData });

      const resultPromise = apiClient.getMultipleStreamsInfo(['livechannel', 'offlinechannel']);
      
      // Advance timers to process queue
      jest.advanceTimersByTime(200);

      const result = await resultPromise;

      expect(result).toHaveLength(2);
      expect(result[0]?.isLive).toBe(true);
      expect(result[1]?.isLive).toBe(false);
    });
  });

  describe('rate limiting', () => {
    it('should track request timestamps', () => {
      const queueStatus = apiClient.getQueueStatus();
      
      expect(queueStatus).toHaveProperty('pending');
      expect(queueStatus).toHaveProperty('processing');
      expect(queueStatus).toHaveProperty('recentRequests');
      expect(queueStatus).toHaveProperty('rateLimitWindow');
      expect(queueStatus).toHaveProperty('maxRequests');
    });
  });

  describe('updateAccessToken', () => {
    it('should update the access token', () => {
      const newToken = 'new-access-token';
      const mockAxiosInstance = mockedAxios.create();
      
      apiClient.updateAccessToken(newToken);
      
      expect(mockAxiosInstance.defaults.headers['Authorization']).toBe(`Bearer ${newToken}`);
    });

    it('should handle oauth: prefix in new token', () => {
      const newTokenWithPrefix = 'oauth:new-token';
      const mockAxiosInstance = mockedAxios.create();
      
      apiClient.updateAccessToken(newTokenWithPrefix);
      
      expect(mockAxiosInstance.defaults.headers['Authorization']).toBe('Bearer new-token');
    });
  });
});