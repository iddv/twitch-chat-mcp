import { Express, Request, Response } from 'express';
import { TwitchClient, ChatMessage } from '@/twitch/twitchIntegration';
import { setupLogger } from '@/utils/logger';

const logger = setupLogger();

// Interface for tool request from Claude
interface ToolRequest {
  name: string;
  parameters: {
    channel: string;
    duration?: number;
    message?: string;
  };
}

// Interface for chat observation response
interface ChatObservationResponse {
  messages: ChatMessage[];
  channelStats: {
    totalMessages: number;
    uniqueUsers: number;
    duration: number;
  };
}

/**
 * Registers tool routes for Claude to use
 */
export function registerToolRoutes(app: Express, twitchClient: TwitchClient | null) {
  // Tool definition endpoint
  app.get('/tools/definitions', (_req: Request, res: Response) => {
    const toolDefinitions = [
      {
        name: 'observe_twitch_chat',
        description: 'Observe Twitch chat in a specific channel for a configurable duration',
        parameters: {
          type: 'object',
          properties: {
            channel: {
              type: 'string',
              description: 'The Twitch channel to observe (without the # prefix)'
            },
            duration: {
              type: 'integer',
              description: 'Duration to observe in milliseconds (default: 60000 = 1 minute)'
            }
          },
          required: ['channel']
        }
      },
      {
        name: 'send_twitch_message',
        description: 'Send a message to a Twitch channel',
        parameters: {
          type: 'object',
          properties: {
            channel: {
              type: 'string',
              description: 'The Twitch channel to send a message to (without the # prefix)'
            },
            message: {
              type: 'string',
              description: 'The message to send to the channel'
            }
          },
          required: ['channel', 'message']
        }
      }
    ];
    
    res.status(200).json(toolDefinitions);
  });
  
  // Tool execution endpoint
  app.post('/tools/execute', async (req: Request, res: Response) => {
    try {
      const { name, parameters } = req.body as ToolRequest;
      
      if (!name) {
        return res.status(400).json({ error: 'Missing tool name' });
      }
      
      if (!parameters) {
        return res.status(400).json({ error: 'Missing tool parameters' });
      }
      
      // Check if Twitch client is available
      if (!twitchClient) {
        return res.status(401).json({ 
          error: 'Not authenticated with Twitch', 
          auth_url: '/auth/twitch/login'
        });
      }
      
      switch (name) {
        case 'observe_twitch_chat': {
          const { channel, duration = 60000 } = parameters;
          
          if (!channel) {
            return res.status(400).json({ error: 'Missing channel parameter' });
          }
          
          logger.info(`Observing Twitch chat in channel: ${channel} for ${duration}ms`);
          
          // Observe chat
          const messages = await twitchClient.observeChat(channel, duration);
          
          // Calculate stats
          const uniqueUsers = new Set(messages.map(msg => msg.username)).size;
          
          const response: ChatObservationResponse = {
            messages,
            channelStats: {
              totalMessages: messages.length,
              uniqueUsers,
              duration
            }
          };
          
          return res.status(200).json(response);
        }
          
        case 'send_twitch_message': {
          const { channel, message } = parameters;
          
          if (!channel) {
            return res.status(400).json({ error: 'Missing channel parameter' });
          }
          
          if (!message) {
            return res.status(400).json({ error: 'Missing message parameter' });
          }
          
          logger.info(`Sending message to Twitch channel: ${channel}`);
          
          // Send message
          await twitchClient.sendChatMessage(channel, message);
          
          return res.status(200).json({ 
            success: true, 
            message: `Message sent to channel ${channel}` 
          });
        }
          
        default:
          return res.status(400).json({ error: `Unknown tool: ${name}` });
      }
    } catch (error) {
      logger.error('Error executing tool', { error });
      return res.status(500).json({ 
        error: 'Failed to execute tool', 
        details: (error as Error).message 
      });
    }
  });
  
  logger.info('Registered Claude tool routes');
} 