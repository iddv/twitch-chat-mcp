import { createMCPServer } from '@/mcp/server';

// Mock the Twitch integration
jest.mock('@/twitch/twitchIntegration', () => ({
  setupTwitchIntegration: jest.fn().mockResolvedValue({
    apiClient: {
      getStreamInfo: jest.fn(),
      getChannelInfo: jest.fn(),
      getMultipleStreamsInfo: jest.fn(),
      getQueueStatus: jest.fn(() => ({ pending: 0, processing: false }))
    }
  })
}));

describe('MCP Server', () => {
  let server: any;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('should create MCP server successfully without Twitch token', async () => {
    // Remove token to test without Twitch integration
    const originalToken = process.env.TWITCH_OAUTH_TOKEN;
    delete process.env.TWITCH_OAUTH_TOKEN;

    try {
      server = await createMCPServer();
      expect(server).toBeDefined();
      expect(server.name).toBe('twitch-mcp-server');
      expect(server.version).toBe('0.1.0');
    } finally {
      // Restore original token
      if (originalToken) {
        process.env.TWITCH_OAUTH_TOKEN = originalToken;
      }
    }
  });

  it('should create MCP server successfully with Twitch token', async () => {
    // Set a mock token
    process.env.TWITCH_OAUTH_TOKEN = 'mock_token';
    process.env.TWITCH_CLIENT_ID = 'mock_client_id';

    server = await createMCPServer();
    expect(server).toBeDefined();
    expect(server.name).toBe('twitch-mcp-server');
    expect(server.version).toBe('0.1.0');
  });

  it('should handle Twitch integration failure gracefully', async () => {
    // Mock setupTwitchIntegration to throw an error
    const { setupTwitchIntegration } = require('@/twitch/twitchIntegration');
    setupTwitchIntegration.mockRejectedValueOnce(new Error('Mock Twitch error'));

    process.env.TWITCH_OAUTH_TOKEN = 'mock_token';
    process.env.TWITCH_CLIENT_ID = 'mock_client_id';

    // Should not throw, but continue without Twitch integration
    server = await createMCPServer();
    expect(server).toBeDefined();
  });
});