import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { setupStreamTools } from '@/mcp/tools';
import { TwitchAPIClient } from '@/twitch/apiClient';
import { TwitchClient, ChatMessage } from '@/twitch/twitchIntegration';
import { setupLogger } from '@/utils/logger';

// Mock dependencies
jest.mock('@/utils/logger', () => ({
  setupLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

jest.mock('@/mcp/resources', () => ({
  startStreamMonitoring: jest.fn(),
  stopStreamMonitoring: jest.fn(),
  createPersistentStreamLink: jest.fn(),
  getMonitoringStatus: jest.fn()
}));

jest.mock('@/mcp/chatResources', () => ({
  startChatRecording: jest.fn(),
  stopChatRecording: jest.fn(),
  createPersistentChatHistory: jest.fn(),
  startAnalyticsProcessing: jest.fn()
}));

describe('Enhanced Chat Tools', () => {
  let server: Server;
  let mockTwitchClient: jest.Mocked<TwitchClient>;
  let mockTwitchAPIClient: jest.Mocked<TwitchAPIClient>;
  let listToolsHandler: any;
  let callToolHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock server
    server = {
      setRequestHandler: jest.fn((schema, handler) => {
        if (schema === ListToolsRequestSchema) {
          listToolsHandler = handler;
        } else if (schema === CallToolRequestSchema) {
          callToolHandler = handler;
        }
      }),
      request: jest.fn(),
      notification: jest.fn()
    } as any;

    // Create mock Twitch client
    mockTwitchClient = {
      observeChat: jest.fn(),
      sendChatMessage: jest.fn(),
      getConnectionHealth: jest.fn(),
      getQueueStatus: jest.fn(),
      apiClient: {} as TwitchAPIClient,
      getStreamInfo: jest.fn(),
      getChannelInfo: jest.fn(),
      getMultipleStreamsInfo: jest.fn()
    } as any;

    // Create mock API client
    mockTwitchAPIClient = {
      getStreamInfo: jest.fn(),
      getChannelInfo: jest.fn(),
      getMultipleStreamsInfo: jest.fn()
    } as any;

    // Setup tools
    setupStreamTools(server, mockTwitchAPIClient, mockTwitchClient);
  });

  describe('send_twitch_message_with_confirmation', () => {
    it('should send message without confirmation when requireConfirmation is false', async () => {
      mockTwitchClient.sendChatMessage.mockResolvedValue();

      expect(callToolHandler).toBeDefined();

      const result = await callToolHandler({
        params: {
          name: 'send_twitch_message_with_confirmation',
          arguments: {
            channel: 'testchannel',
            message: 'Hello world!',
            requireConfirmation: false
          }
        }
      });

      expect(mockTwitchClient.sendChatMessage).toHaveBeenCalledWith('testchannel', 'Hello world!');
      expect(result.content[0].text).toContain('"success": true');
      expect(result.content[0].text).toContain('Message sent to testchannel');
    });

    it('should handle missing Twitch client', async () => {
      // Re-setup with null client
      setupStreamTools(server, mockTwitchAPIClient, null);

      await expect(callToolHandler({
        params: {
          name: 'send_twitch_message_with_confirmation',
          arguments: {
            channel: 'testchannel',
            message: 'Hello world!'
          }
        }
      })).rejects.toThrow('Twitch client not available');
    });

    it('should handle send message failure', async () => {
      mockTwitchClient.sendChatMessage.mockRejectedValue(new Error('Connection failed'));

      await expect(callToolHandler({
        params: {
          name: 'send_twitch_message_with_confirmation',
          arguments: {
            channel: 'testchannel',
            message: 'Hello world!',
            requireConfirmation: false
          }
        }
      })).rejects.toThrow('Failed to send message: Connection failed');
    });
  });

  describe('observe_twitch_chat_streaming', () => {
    it('should observe chat and return messages', async () => {
      const mockMessages: ChatMessage[] = [
        {
          channel: 'testchannel',
          username: 'user1',
          message: 'Hello!',
          timestamp: new Date()
        },
        {
          channel: 'testchannel',
          username: 'user2',
          message: 'How are you?',
          timestamp: new Date()
        }
      ];

      mockTwitchClient.observeChat.mockResolvedValue(mockMessages);

      const result = await callToolHandler({
        params: {
          name: 'observe_twitch_chat_streaming',
          arguments: {
            channel: 'testchannel',
            duration: 30000,
            enableStreaming: false
          }
        }
      });

      expect(mockTwitchClient.observeChat).toHaveBeenCalledWith('testchannel', 30000);
      expect(result.content[0].text).toContain('"success": true');
      expect(result.content[0].text).toContain('Chat observation completed');
      expect(result.content[0].text).toContain('"messagesCollected": 2');
    });

    it('should handle resume token for existing session', async () => {
      // First call to create a session
      mockTwitchClient.observeChat.mockResolvedValue([]);
      await callToolHandler({
        params: {
          name: 'observe_twitch_chat_streaming',
          arguments: {
            channel: 'testchannel',
            duration: 1000
          }
        }
      });

      // Second call with resume token should detect active session
      const result = await callToolHandler({
        params: {
          name: 'observe_twitch_chat_streaming',
          arguments: {
            channel: 'testchannel',
            resumeToken: 'invalid_token'
          }
        }
      });

      expect(result.content[0].text).toContain('"success": true');
    });
  });

  describe('detect_chat_commands', () => {
    it('should detect and analyze chat commands', async () => {
      const mockMessages: ChatMessage[] = [
        {
          channel: 'testchannel',
          username: 'user1',
          message: '!song',
          timestamp: new Date()
        },
        {
          channel: 'testchannel',
          username: 'user2',
          message: '!uptime',
          timestamp: new Date()
        },
        {
          channel: 'testchannel',
          username: 'user3',
          message: 'regular message',
          timestamp: new Date()
        }
      ];

      mockTwitchClient.observeChat.mockResolvedValue(mockMessages);

      const result = await callToolHandler({
        params: {
          name: 'detect_chat_commands',
          arguments: {
            channel: 'testchannel',
            commandPrefix: '!',
            duration: 60000,
            enableAIResponses: true
          }
        }
      });

      expect(mockTwitchClient.observeChat).toHaveBeenCalledWith('testchannel', 60000);
      expect(result.content[0].text).toContain('"success": true');
      expect(result.content[0].text).toContain('"commandsDetected": 2');
      expect(result.content[0].text).toContain('song');
      expect(result.content[0].text).toContain('uptime');
    });

    it('should handle custom command prefix', async () => {
      const mockMessages: ChatMessage[] = [
        {
          channel: 'testchannel',
          username: 'user1',
          message: '?help',
          timestamp: new Date()
        }
      ];

      mockTwitchClient.observeChat.mockResolvedValue(mockMessages);

      const result = await callToolHandler({
        params: {
          name: 'detect_chat_commands',
          arguments: {
            channel: 'testchannel',
            commandPrefix: '?',
            enableAIResponses: false
          }
        }
      });

      expect(result.content[0].text).toContain('"commandsDetected": 1');
      expect(result.content[0].text).toContain('help');
    });
  });

  describe('moderate_chat_with_approval', () => {
    it('should execute timeout action without approval when requireApproval is false', async () => {
      mockTwitchClient.sendChatMessage.mockResolvedValue();

      const result = await callToolHandler({
        params: {
          name: 'moderate_chat_with_approval',
          arguments: {
            channel: 'testchannel',
            action: 'timeout',
            target: 'baduser',
            reason: 'Spam',
            duration: 300,
            requireApproval: false
          }
        }
      });

      expect(mockTwitchClient.sendChatMessage).toHaveBeenCalledWith(
        'testchannel',
        '/timeout baduser 300 Spam'
      );
      expect(result.content[0].text).toContain('"success": true');
      expect(result.content[0].text).toContain('Moderation action executed successfully');
    });

    it('should execute ban action', async () => {
      mockTwitchClient.sendChatMessage.mockResolvedValue();

      const result = await callToolHandler({
        params: {
          name: 'moderate_chat_with_approval',
          arguments: {
            channel: 'testchannel',
            action: 'ban',
            target: 'baduser',
            reason: 'Harassment',
            requireApproval: false
          }
        }
      });

      expect(mockTwitchClient.sendChatMessage).toHaveBeenCalledWith(
        'testchannel',
        '/ban baduser Harassment'
      );
      expect(result.content[0].text).toContain('"success": true');
    });

    it('should execute warn_user action', async () => {
      mockTwitchClient.sendChatMessage.mockResolvedValue();

      const result = await callToolHandler({
        params: {
          name: 'moderate_chat_with_approval',
          arguments: {
            channel: 'testchannel',
            action: 'warn_user',
            target: 'newuser',
            reason: 'Please follow chat rules',
            requireApproval: false
          }
        }
      });

      expect(mockTwitchClient.sendChatMessage).toHaveBeenCalledWith(
        'testchannel',
        '@newuser Warning: Please follow chat rules'
      );
      expect(result.content[0].text).toContain('"success": true');
    });

    it('should require duration for timeout action', async () => {
      await expect(callToolHandler({
        params: {
          name: 'moderate_chat_with_approval',
          arguments: {
            channel: 'testchannel',
            action: 'timeout',
            target: 'baduser',
            reason: 'Spam',
            requireApproval: false
          }
        }
      })).rejects.toThrow('Duration is required for timeout action');
    });

    it('should handle unsupported moderation action', async () => {
      await expect(callToolHandler({
        params: {
          name: 'moderate_chat_with_approval',
          arguments: {
            channel: 'testchannel',
            action: 'invalid_action',
            target: 'user',
            reason: 'test',
            requireApproval: false
          }
        }
      })).rejects.toThrow('Unsupported moderation action: invalid_action');
    });
  });

  describe('Tool Registration', () => {
    it('should register all enhanced chat tools', async () => {
      expect(listToolsHandler).toBeDefined();

      const result = await listToolsHandler();
      expect(result).toBeDefined();
      expect(result.tools).toBeDefined();
      
      const toolNames = result.tools.map((tool: any) => tool.name);

      expect(toolNames).toContain('send_twitch_message_with_confirmation');
      expect(toolNames).toContain('observe_twitch_chat_streaming');
      expect(toolNames).toContain('detect_chat_commands');
      expect(toolNames).toContain('moderate_chat_with_approval');
    });

    it('should have proper tool schemas', async () => {
      const result = await listToolsHandler();
      expect(result).toBeDefined();
      expect(result.tools).toBeDefined();
      
      const sendMessageTool = result.tools.find((tool: any) => 
        tool.name === 'send_twitch_message_with_confirmation'
      );

      expect(sendMessageTool).toBeDefined();
      expect(sendMessageTool.description).toContain('user confirmation via elicitation');
      expect(sendMessageTool.inputSchema.properties.channel).toBeDefined();
      expect(sendMessageTool.inputSchema.properties.message).toBeDefined();
      expect(sendMessageTool.inputSchema.properties.requireConfirmation).toBeDefined();
    });
  });
});