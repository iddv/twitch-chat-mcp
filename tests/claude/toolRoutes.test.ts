import { Express, Request, Response } from 'express';
import { TwitchClient, ChatMessage } from '../../src/twitch/twitchIntegration';
import { registerToolRoutes } from '../../src/claude/toolRoutes';

// Mock express
jest.mock('express', () => {
  const mockApp = {
    get: jest.fn(),
    post: jest.fn()
  };
  return {
    mockApp
  };
});

describe('Tool Routes', () => {
  let mockApp: Partial<Express>;
  let mockTwitchClient: Partial<TwitchClient>;
  let mockMessages: ChatMessage[];
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  
  beforeEach(() => {
    // Create mock app
    mockApp = {
      get: jest.fn(),
      post: jest.fn()
    };
    
    // Create mock messages
    mockMessages = [
      {
        channel: 'testchannel',
        username: 'user1',
        message: 'Hello world!',
        timestamp: new Date()
      }
    ];
    
    // Create mock Twitch client
    mockTwitchClient = {
      observeChat: jest.fn().mockResolvedValue(mockMessages),
      sendChatMessage: jest.fn().mockResolvedValue(undefined)
    };
    
    // Create mock request and response
    mockRequest = {
      body: {}
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });
  
  test('should register tool routes', () => {
    // Register routes
    registerToolRoutes(mockApp as Express, mockTwitchClient as TwitchClient);
    
    // Verify routes were registered
    expect(mockApp.get).toHaveBeenCalledWith('/tools/definitions', expect.any(Function));
    expect(mockApp.post).toHaveBeenCalledWith('/tools/execute', expect.any(Function));
  });
  
  test('should return tool definitions', () => {
    // Register routes
    registerToolRoutes(mockApp as Express, mockTwitchClient as TwitchClient);
    
    // Get the route handler
    const handler = mockApp.get.mock.calls[0][1];
    
    // Call the handler
    handler(mockRequest as Request, mockResponse as Response);
    
    // Verify response
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        name: 'observe_twitch_chat'
      }),
      expect.objectContaining({
        name: 'send_twitch_message'
      })
    ]));
  });
}); 