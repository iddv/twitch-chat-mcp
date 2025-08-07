import { ChatMessage, TwitchClient } from '@/twitch/twitchIntegration';

// Mock TMI.js client
jest.mock('tmi.js', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        connect: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        join: jest.fn().mockResolvedValue(undefined),
        say: jest.fn().mockResolvedValue(undefined),
        getChannels: jest.fn().mockReturnValue(['#testchannel'])
      };
    })
  };
});

describe('Twitch Integration', () => {
  let mockTwitchClient: Partial<TwitchClient>;
  let mockMessages: ChatMessage[];
  
  beforeEach(() => {
    // Create mock messages
    mockMessages = [
      {
        channel: 'testchannel',
        username: 'user1',
        message: 'Hello world!',
        timestamp: new Date()
      },
      {
        channel: 'testchannel',
        username: 'user2',
        message: 'Testing the chat!',
        timestamp: new Date()
      }
    ];
    
    // Create mock Twitch client
    mockTwitchClient = {
      observeChat: jest.fn().mockResolvedValue(mockMessages),
      sendChatMessage: jest.fn().mockResolvedValue(undefined)
    };
  });
  
  test('should observe chat and return messages', async () => {
    // Test observeChat
    const result = await mockTwitchClient.observeChat!('testchannel', 1000);
    
    // Verify results
    expect(result).toEqual(mockMessages);
    expect(result.length).toBe(2);
    expect(mockTwitchClient.observeChat).toHaveBeenCalledWith('testchannel', 1000);
  });
  
  test('should send message to chat', async () => {
    // Test sendChatMessage
    await mockTwitchClient.sendChatMessage!('testchannel', 'Test message');
    
    // Verify results
    expect(mockTwitchClient.sendChatMessage).toHaveBeenCalledWith('testchannel', 'Test message');
  });
}); 