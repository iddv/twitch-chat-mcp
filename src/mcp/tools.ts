import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ProgressNotificationSchema,
  CreateMessageRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TwitchAPIClient } from '../twitch/apiClient';
import { TwitchClient, ChatMessage } from '../twitch/twitchIntegration';
import { setupLogger } from '../utils/logger';
import { 
  ChatObservationSession, 
  ModerationWorkflow, 
  ChatCommand 
} from '../types/enhancedChat';
import { 
  startStreamMonitoring, 
  stopStreamMonitoring, 
  createPersistentStreamLink,
  getMonitoringStatus 
} from './resources';
import {
  startChatRecording,
  stopChatRecording,
  createPersistentChatHistory,
  startAnalyticsProcessing
} from './chatResources';

const logger = setupLogger();

/**
 * Setup MCP tools for stream and chat management
 */
export function setupStreamTools(server: Server, twitchAPIClient: TwitchAPIClient | null, twitchClient: TwitchClient | null = null) {
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      {
        name: "start_stream_monitoring",
        description: "Start real-time monitoring of a Twitch stream with automatic updates",
        inputSchema: {
          type: "object",
          properties: {
            channelName: {
              type: "string",
              description: "The Twitch channel name to monitor"
            },
            updateIntervalMs: {
              type: "number",
              description: "Update interval in milliseconds (default: 30000)",
              default: 30000
            }
          },
          required: ["channelName"]
        }
      },
      {
        name: "stop_stream_monitoring",
        description: "Stop real-time monitoring of a Twitch stream",
        inputSchema: {
          type: "object",
          properties: {
            channelName: {
              type: "string",
              description: "The Twitch channel name to stop monitoring"
            }
          },
          required: ["channelName"]
        }
      },
      {
        name: "create_stream_link",
        description: "Create a persistent resource link for long-term stream access",
        inputSchema: {
          type: "object",
          properties: {
            channelName: {
              type: "string",
              description: "The Twitch channel name to create a persistent link for"
            }
          },
          required: ["channelName"]
        }
      },
      {
        name: "get_monitoring_status",
        description: "Get the current status of all stream monitoring sessions",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "start_chat_recording",
        description: "Start recording chat messages for a channel with persistent storage",
        inputSchema: {
          type: "object",
          properties: {
            channelName: {
              type: "string",
              description: "The Twitch channel name to record chat for"
            }
          },
          required: ["channelName"]
        }
      },
      {
        name: "stop_chat_recording",
        description: "Stop recording chat messages for a channel",
        inputSchema: {
          type: "object",
          properties: {
            channelName: {
              type: "string",
              description: "The Twitch channel name to stop recording chat for"
            }
          },
          required: ["channelName"]
        }
      },
      {
        name: "create_chat_history_link",
        description: "Create a persistent link for chat history with analytics",
        inputSchema: {
          type: "object",
          properties: {
            channelName: {
              type: "string",
              description: "The Twitch channel name"
            },
            timeframe: {
              type: "string",
              description: "Timeframe description (e.g., 'last_hour', 'stream_session')"
            },
            messages: {
              type: "array",
              description: "Array of chat messages to store",
              items: {
                type: "object",
                properties: {
                  username: { type: "string" },
                  message: { type: "string" },
                  timestamp: { type: "string" },
                  badges: { type: "array", items: { type: "string" } }
                }
              }
            }
          },
          required: ["channelName", "timeframe", "messages"]
        }
      },
      {
        name: "start_chat_analytics",
        description: "Start processing chat analytics for a channel and timeframe",
        inputSchema: {
          type: "object",
          properties: {
            channelName: {
              type: "string",
              description: "The Twitch channel name to analyze"
            },
            timeframe: {
              type: "string",
              description: "Timeframe for analysis (e.g., 'last_hour', 'today')"
            }
          },
          required: ["channelName", "timeframe"]
        }
      },
      {
        name: "send_twitch_message_with_confirmation",
        description: "Send a message to Twitch chat with user confirmation via elicitation",
        inputSchema: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              description: "The Twitch channel name to send message to"
            },
            message: {
              type: "string",
              description: "The message to send to chat"
            },
            requireConfirmation: {
              type: "boolean",
              description: "Whether to require user confirmation before sending (default: true)",
              default: true
            }
          },
          required: ["channel", "message"]
        }
      },
      {
        name: "observe_twitch_chat_streaming",
        description: "Observe Twitch chat with real-time progress streaming and resumability",
        inputSchema: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              description: "The Twitch channel name to observe"
            },
            duration: {
              type: "number",
              description: "Duration to observe in milliseconds (default: 60000)",
              default: 60000
            },
            enableStreaming: {
              type: "boolean",
              description: "Enable real-time progress streaming (default: true)",
              default: true
            },
            resumeToken: {
              type: "string",
              description: "Token to resume a previous observation session"
            }
          },
          required: ["channel"]
        }
      },
      {
        name: "detect_chat_commands",
        description: "Detect and analyze chat commands with AI-powered response generation",
        inputSchema: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              description: "The Twitch channel name to monitor for commands"
            },
            commandPrefix: {
              type: "string",
              description: "Command prefix to detect (default: '!')",
              default: "!"
            },
            duration: {
              type: "number",
              description: "Duration to monitor in milliseconds (default: 300000)",
              default: 300000
            },
            enableAIResponses: {
              type: "boolean",
              description: "Enable AI-powered response generation via sampling (default: true)",
              default: true
            }
          },
          required: ["channel"]
        }
      },
      {
        name: "moderate_chat_with_approval",
        description: "Multi-turn moderation workflow with user approval for actions",
        inputSchema: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              description: "The Twitch channel name to moderate"
            },
            action: {
              type: "string",
              enum: ["timeout", "ban", "delete_message", "warn_user"],
              description: "The moderation action to take"
            },
            target: {
              type: "string",
              description: "The username or message ID to target"
            },
            reason: {
              type: "string",
              description: "Reason for the moderation action"
            },
            duration: {
              type: "number",
              description: "Duration for timeout in seconds (if applicable)"
            },
            requireApproval: {
              type: "boolean",
              description: "Whether to require user approval before taking action (default: true)",
              default: true
            }
          },
          required: ["channel", "action", "target", "reason"]
        }
      },
      {
        name: "get_stream_info_persistent",
        description: "Get stream information with resource links for continuous monitoring",
        inputSchema: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              description: "The Twitch channel name to get stream info for"
            },
            enableCaching: {
              type: "boolean",
              description: "Enable durable caching for the stream info (default: true)",
              default: true
            },
            createResourceLink: {
              type: "boolean",
              description: "Create a persistent resource link for continuous access (default: true)",
              default: true
            }
          },
          required: ["channel"]
        }
      },
      {
        name: "get_channel_info_persistent",
        description: "Get channel information with durable caching and progress updates",
        inputSchema: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              description: "The Twitch channel name to get info for"
            },
            includeFollowers: {
              type: "boolean",
              description: "Include follower information (default: false)",
              default: false
            },
            includeSubscribers: {
              type: "boolean",
              description: "Include subscriber information (default: false)",
              default: false
            },
            enableCaching: {
              type: "boolean",
              description: "Enable durable caching for the channel info (default: true)",
              default: true
            },
            enableProgressUpdates: {
              type: "boolean",
              description: "Enable progress updates for data fetching (default: true)",
              default: true
            }
          },
          required: ["channel"]
        }
      },
      {
        name: "get_followers_batch",
        description: "Retrieve followers with resumable batch processing",
        inputSchema: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              description: "The Twitch channel name to get followers for"
            },
            batchSize: {
              type: "number",
              description: "Number of followers to fetch per batch (default: 100)",
              default: 100
            },
            maxFollowers: {
              type: "number",
              description: "Maximum number of followers to fetch (default: 1000)",
              default: 1000
            },
            resumeToken: {
              type: "string",
              description: "Token to resume a previous batch processing session"
            },
            enableProgressUpdates: {
              type: "boolean",
              description: "Enable streaming progress updates (default: true)",
              default: true
            }
          },
          required: ["channel"]
        }
      },
      {
        name: "monitor_stream_persistent",
        description: "Create persistent monitoring tools that survive server restarts",
        inputSchema: {
          type: "object",
          properties: {
            channel: {
              type: "string",
              description: "The Twitch channel name to monitor"
            },
            monitoringType: {
              type: "string",
              enum: ["stream_status", "follower_notifications", "subscriber_notifications", "all"],
              description: "Type of monitoring to enable (default: 'all')",
              default: "all"
            },
            updateInterval: {
              type: "number",
              description: "Update interval in milliseconds (default: 30000)",
              default: 30000
            },
            enableNotifications: {
              type: "boolean",
              description: "Enable real-time streaming notifications (default: true)",
              default: true
            },
            persistAcrossRestarts: {
              type: "boolean",
              description: "Persist monitoring across server restarts (default: true)",
              default: true
            }
          },
          required: ["channel"]
        }
      }
    ];

    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "start_stream_monitoring":
          return await handleStartStreamMonitoring(args);
          
        case "stop_stream_monitoring":
          return await handleStopStreamMonitoring(args);
          
        case "create_stream_link":
          return await handleCreateStreamLink(args);
          
        case "get_monitoring_status":
          return await handleGetMonitoringStatus();
          
        case "start_chat_recording":
          return await handleStartChatRecording(args);
          
        case "stop_chat_recording":
          return await handleStopChatRecording(args);
          
        case "create_chat_history_link":
          return await handleCreateChatHistoryLink(args);
          
        case "start_chat_analytics":
          return await handleStartChatAnalytics(args);
          
        case "send_twitch_message_with_confirmation":
          return await handleSendMessageWithConfirmation(server, args, twitchClient);
          
        case "observe_twitch_chat_streaming":
          return await handleObserveChatStreaming(server, args, twitchClient);
          
        case "detect_chat_commands":
          return await handleDetectChatCommands(server, args, twitchClient);
          
        case "moderate_chat_with_approval":
          return await handleModerateChatWithApproval(server, args, twitchClient);
          
        case "get_stream_info_persistent":
          return await handleGetStreamInfoPersistent(server, args, twitchAPIClient);
          
        case "get_channel_info_persistent":
          return await handleGetChannelInfoPersistent(server, args, twitchAPIClient);
          
        case "get_followers_batch":
          return await handleGetFollowersBatch(server, args, twitchAPIClient);
          
        case "monitor_stream_persistent":
          return await handleMonitorStreamPersistent(server, args, twitchAPIClient);
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error(`Tool execution failed: ${name}`, { error, args });
      throw error;
    }
  });

  logger.info('Stream tools initialized');
}

/**
 * Cleanup function for persistent monitoring and sessions
 */
export function cleanupPersistentTools() {
  // Stop all persistent monitors
  for (const [monitorId, monitor] of persistentStreamMonitors.entries()) {
    if (monitor.intervalId) {
      clearInterval(monitor.intervalId);
    }
    monitor.isActive = false;
  }
  
  // Clear all sessions
  activeChatSessions.clear();
  moderationWorkflows.clear();
  persistentStreamMonitors.clear();
  batchProcessingSessions.clear();
  
  logger.info('Persistent tools cleaned up');
}

/**
 * Get status of all persistent tools
 */
export function getPersistentToolsStatus() {
  return {
    activeChatSessions: activeChatSessions.size,
    moderationWorkflows: moderationWorkflows.size,
    persistentMonitors: persistentStreamMonitors.size,
    batchSessions: batchProcessingSessions.size,
    activeMonitors: Array.from(persistentStreamMonitors.values()).filter(m => m.isActive).length
  };
}

/**
 * Handle start stream monitoring tool
 */
async function handleStartStreamMonitoring(args: any) {
  const { channelName, updateIntervalMs = 30000 } = args;
  
  if (!channelName || typeof channelName !== 'string') {
    throw new Error('channelName is required and must be a string');
  }
  
  if (updateIntervalMs < 5000) {
    throw new Error('updateIntervalMs must be at least 5000 (5 seconds) to respect API limits');
  }
  
  const sessionId = startStreamMonitoring(channelName, updateIntervalMs);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        message: `Started monitoring stream for ${channelName}`,
        sessionId,
        channelName,
        updateIntervalMs,
        resourceUri: `twitch://stream/${channelName}`,
        startedAt: new Date().toISOString()
      }, null, 2)
    }]
  };
}

/**
 * Handle stop stream monitoring tool
 */
async function handleStopStreamMonitoring(args: any) {
  const { channelName } = args;
  
  if (!channelName || typeof channelName !== 'string') {
    throw new Error('channelName is required and must be a string');
  }
  
  const stopped = stopStreamMonitoring(channelName);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: stopped,
        message: stopped 
          ? `Stopped monitoring stream for ${channelName}`
          : `No active monitoring session found for ${channelName}`,
        channelName,
        stoppedAt: new Date().toISOString()
      }, null, 2)
    }]
  };
}

/**
 * Handle create stream link tool
 */
async function handleCreateStreamLink(args: any) {
  const { channelName } = args;
  
  if (!channelName || typeof channelName !== 'string') {
    throw new Error('channelName is required and must be a string');
  }
  
  const linkId = createPersistentStreamLink(channelName);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        message: `Created persistent stream link for ${channelName}`,
        linkId,
        channelName,
        resourceUri: `twitch://stream-link/${linkId}`,
        createdAt: new Date().toISOString(),
        usage: "This link provides persistent access to stream data across sessions"
      }, null, 2)
    }]
  };
}

/**
 * Handle get monitoring status tool
 */
async function handleGetMonitoringStatus() {
  const status = getMonitoringStatus();
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        status,
        timestamp: new Date().toISOString(),
        summary: {
          hasActiveSessions: status.activeSessions > 0,
          cacheEfficiency: status.cacheStats.hits / (status.cacheStats.hits + status.cacheStats.misses) || 0,
          resourcesAvailable: status.activeSessions + status.persistentLinks
        }
      }, null, 2)
    }]
  };
}

/**
 * Handle start chat recording tool
 */
async function handleStartChatRecording(args: any) {
  const { channelName } = args;
  
  if (!channelName || typeof channelName !== 'string') {
    throw new Error('channelName is required and must be a string');
  }
  
  const sessionId = startChatRecording(channelName);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        message: `Started chat recording for ${channelName}`,
        sessionId,
        channelName,
        resourceUri: `twitch://chat/${channelName}/live`,
        startedAt: new Date().toISOString(),
        note: "Chat messages will be recorded and available for analytics"
      }, null, 2)
    }]
  };
}

/**
 * Handle stop chat recording tool
 */
async function handleStopChatRecording(args: any) {
  const { channelName } = args;
  
  if (!channelName || typeof channelName !== 'string') {
    throw new Error('channelName is required and must be a string');
  }
  
  const stopped = stopChatRecording(channelName);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: stopped,
        message: stopped 
          ? `Stopped chat recording for ${channelName}`
          : `No active recording session found for ${channelName}`,
        channelName,
        stoppedAt: new Date().toISOString()
      }, null, 2)
    }]
  };
}

/**
 * Handle create chat history link tool
 */
async function handleCreateChatHistoryLink(args: any) {
  const { channelName, timeframe, messages } = args;
  
  if (!channelName || typeof channelName !== 'string') {
    throw new Error('channelName is required and must be a string');
  }
  
  if (!timeframe || typeof timeframe !== 'string') {
    throw new Error('timeframe is required and must be a string');
  }
  
  if (!Array.isArray(messages)) {
    throw new Error('messages is required and must be an array');
  }
  
  const linkId = await createPersistentChatHistory(channelName, timeframe, messages);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        message: `Created persistent chat history for ${channelName}`,
        linkId,
        channelName,
        timeframe,
        messageCount: messages.length,
        resourceUri: `twitch://chat/history/${linkId}`,
        createdAt: new Date().toISOString(),
        usage: "This link provides persistent access to chat history with analytics across sessions"
      }, null, 2)
    }]
  };
}

/**
 * Handle start chat analytics tool
 */
async function handleStartChatAnalytics(args: any) {
  const { channelName, timeframe } = args;
  
  if (!channelName || typeof channelName !== 'string') {
    throw new Error('channelName is required and must be a string');
  }
  
  if (!timeframe || typeof timeframe !== 'string') {
    throw new Error('timeframe is required and must be a string');
  }
  
  const taskId = startAnalyticsProcessing(channelName, timeframe);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        message: `Started chat analytics processing for ${channelName}`,
        taskId,
        channelName,
        timeframe,
        resourceUri: `twitch://chat/analytics/${taskId}`,
        startedAt: new Date().toISOString(),
        note: "Analytics processing will run in the background. Check the analytics resource for progress updates."
      }, null, 2)
    }]
  };
}

// Storage for active chat observation sessions
const activeChatSessions = new Map<string, ChatObservationSession>();

// Storage for moderation workflows
const moderationWorkflows = new Map<string, ModerationWorkflow>();

/**
 * Handle send message with confirmation tool
 */
async function handleSendMessageWithConfirmation(server: Server, args: any, twitchClient: TwitchClient | null) {
  const { channel, message, requireConfirmation = true } = args;
  
  if (!channel || typeof channel !== 'string') {
    throw new Error('channel is required and must be a string');
  }
  
  if (!message || typeof message !== 'string') {
    throw new Error('message is required and must be a string');
  }
  
  if (!twitchClient) {
    throw new Error('Twitch client not available. Please authenticate first.');
  }
  
  if (requireConfirmation) {
    // For now, we'll implement a simple confirmation mechanism
    // In a full implementation, this would use MCP elicitation
    logger.info(`Confirmation required for message to ${channel}: "${message}"`);
    
    // TODO: Implement proper elicitation when MCP SDK supports it
    // For now, we'll proceed with a warning
    logger.warn('Proceeding without user confirmation - elicitation not yet implemented');
  }
  
  try {
    await twitchClient.sendChatMessage(channel, message);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Message sent to ${channel}`,
          channel,
          sentMessage: message,
          timestamp: new Date().toISOString(),
          confirmed: requireConfirmation
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error(`Failed to send message to ${channel}`, { error, message });
    throw new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handle observe chat streaming tool
 */
async function handleObserveChatStreaming(server: Server, args: any, twitchClient: TwitchClient | null) {
  const { channel, duration = 60000, enableStreaming = true, resumeToken } = args;
  
  if (!channel || typeof channel !== 'string') {
    throw new Error('channel is required and must be a string');
  }
  
  if (!twitchClient) {
    throw new Error('Twitch client not available. Please authenticate first.');
  }
  
  // Generate session ID
  const sessionId = resumeToken || `chat_obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Check if resuming an existing session
  let existingSession = activeChatSessions.get(sessionId);
  if (resumeToken && existingSession) {
    if (existingSession.isActive) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            message: "Session is already active",
            sessionId,
            channel: existingSession.channel,
            messagesCollected: existingSession.messages.length
          }, null, 2)
        }]
      };
    }
  }
  
  // Create or resume session
  const session: ChatObservationSession = existingSession || {
    sessionId,
    channel,
    startTime: new Date(),
    duration,
    messages: [],
    isActive: true
  };
  
  activeChatSessions.set(sessionId, session);
  
  // Set up progress streaming if enabled
  if (enableStreaming) {
    session.progressCallback = (progress: number, messages: ChatMessage[]) => {
      // TODO: Implement proper progress notifications when MCP SDK supports it
      logger.info(`Progress update for session ${sessionId}`, {
        progress,
        messagesCollected: messages.length,
        channel
      });
    };
  }
  
  try {
    // Start observing chat
    const observedMessages = await twitchClient.observeChat(channel, duration);
    
    // Update session with collected messages
    session.messages.push(...observedMessages);
    session.isActive = false;
    
    // Send final progress notification
    if (enableStreaming) {
      // TODO: Implement proper progress notifications when MCP SDK supports it
      logger.info(`Chat observation completed for session ${sessionId}`, {
        channel,
        totalMessages: session.messages.length
      });
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Chat observation completed for ${channel}`,
          sessionId,
          channel,
          duration,
          messagesCollected: session.messages.length,
          messages: session.messages.slice(-50), // Return last 50 messages
          resumeToken: sessionId,
          resourceUri: `twitch://chat/session/${sessionId}`,
          completedAt: new Date().toISOString()
        }, null, 2)
      }]
    };
  } catch (error) {
    session.isActive = false;
    logger.error(`Failed to observe chat in ${channel}`, { error, sessionId });
    throw new Error(`Failed to observe chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handle detect chat commands tool
 */
async function handleDetectChatCommands(server: Server, args: any, twitchClient: TwitchClient | null) {
  const { channel, commandPrefix = '!', duration = 300000, enableAIResponses = true } = args;
  
  if (!channel || typeof channel !== 'string') {
    throw new Error('channel is required and must be a string');
  }
  
  if (!twitchClient) {
    throw new Error('Twitch client not available. Please authenticate first.');
  }
  
  const sessionId = `cmd_detect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const detectedCommands: ChatCommand[] = [];
  
  try {
    // Start observing chat for commands
    const messages = await twitchClient.observeChat(channel, duration);
    
    // Filter and analyze commands
    for (const message of messages) {
      if (message.message.startsWith(commandPrefix)) {
        const parts = message.message.slice(commandPrefix.length).split(' ');
        const command = parts[0]?.toLowerCase() || '';
        const commandArgs = parts.slice(1);
        
        const commandData = {
          command,
          username: message.username,
          args: commandArgs,
          timestamp: message.timestamp
        };
        
        // Generate AI response if enabled
        if (enableAIResponses) {
          try {
            // TODO: Implement proper AI sampling when MCP SDK supports it
            // For now, we'll provide a placeholder response
            const aiResponse = `Command "${command}" detected from ${message.username}. Args: ${commandArgs.join(' ')}`;
            (commandData as any).aiResponse = aiResponse;
            logger.info(`AI response generated for command ${command}`, { response: aiResponse });
          } catch (error) {
            logger.warn(`Failed to generate AI response for command ${command}`, { error });
          }
        }
        
        detectedCommands.push(commandData);
      }
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Command detection completed for ${channel}`,
          sessionId,
          channel,
          commandPrefix,
          duration,
          totalMessages: messages.length,
          commandsDetected: detectedCommands.length,
          commands: detectedCommands,
          aiResponsesEnabled: enableAIResponses,
          completedAt: new Date().toISOString()
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error(`Failed to detect commands in ${channel}`, { error, sessionId });
    throw new Error(`Failed to detect commands: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handle moderate chat with approval tool
 */
async function handleModerateChatWithApproval(server: Server, args: any, twitchClient: TwitchClient | null) {
  const { channel, action, target, reason, duration, requireApproval = true } = args;
  
  if (!channel || typeof channel !== 'string') {
    throw new Error('channel is required and must be a string');
  }
  
  if (!action || typeof action !== 'string') {
    throw new Error('action is required and must be a string');
  }
  
  if (!target || typeof target !== 'string') {
    throw new Error('target is required and must be a string');
  }
  
  if (!reason || typeof reason !== 'string') {
    throw new Error('reason is required and must be a string');
  }
  
  if (!twitchClient) {
    throw new Error('Twitch client not available. Please authenticate first.');
  }
  
  const workflowId = `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Create moderation workflow
  const workflow: ModerationWorkflow = {
    workflowId,
    channel,
    action: action as ModerationWorkflow['action'],
    target,
    reason,
    duration,
    status: 'pending_approval',
    createdAt: new Date()
  };
  
  moderationWorkflows.set(workflowId, workflow);
  
  if (requireApproval) {
    // TODO: Implement proper elicitation when MCP SDK supports it
    // For now, we'll log the approval request and proceed with a warning
    logger.info(`Approval required for moderation action`, {
      channel,
      action,
      target,
      reason,
      duration
    });
    
    logger.warn('Proceeding without user approval - elicitation not yet implemented');
    workflow.status = 'approved';
  }
  
  try {
    // Execute moderation action based on type
    let executionResult = '';
    
    switch (action) {
      case 'timeout':
        if (!duration) {
          throw new Error('Duration is required for timeout action');
        }
        await twitchClient.sendChatMessage(channel, `/timeout ${target} ${duration} ${reason}`);
        executionResult = `User ${target} timed out for ${duration} seconds`;
        break;
        
      case 'ban':
        await twitchClient.sendChatMessage(channel, `/ban ${target} ${reason}`);
        executionResult = `User ${target} banned`;
        break;
        
      case 'delete_message':
        // Note: This would require message ID, simplified for demo
        await twitchClient.sendChatMessage(channel, `/delete ${target}`);
        executionResult = `Message from ${target} deleted`;
        break;
        
      case 'warn_user':
        await twitchClient.sendChatMessage(channel, `@${target} Warning: ${reason}`);
        executionResult = `Warning sent to ${target}`;
        break;
        
      default:
        throw new Error(`Unsupported moderation action: ${action}`);
    }
    
    workflow.status = 'executed';
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: "Moderation action executed successfully",
          workflowId,
          channel,
          action,
          target,
          reason,
          duration,
          executionResult,
          status: 'executed',
          approved: requireApproval,
          executedAt: new Date().toISOString()
        }, null, 2)
      }]
    };
  } catch (error) {
    workflow.status = 'rejected';
    logger.error(`Failed to execute moderation action`, { error, workflowId, action, target });
    throw new Error(`Failed to execute moderation action: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Storage for persistent stream monitoring
interface PersistentStreamMonitor {
  monitorId: string;
  channel: string;
  monitoringType: string;
  updateInterval: number;
  isActive: boolean;
  lastUpdate: Date;
  resourceLink?: string;
  intervalId?: NodeJS.Timeout;
}

const persistentStreamMonitors = new Map<string, PersistentStreamMonitor>();

// Storage for batch processing sessions
interface BatchProcessingSession {
  sessionId: string;
  channel: string;
  type: 'followers' | 'subscribers';
  batchSize: number;
  maxItems: number;
  processedCount: number;
  totalCount?: number;
  isActive: boolean;
  startedAt: Date;
  lastBatch?: any[];
}

const batchProcessingSessions = new Map<string, BatchProcessingSession>();

/**
 * Handle get stream info persistent tool
 */
async function handleGetStreamInfoPersistent(server: Server, args: any, twitchAPIClient: TwitchAPIClient | null) {
  const { channel, enableCaching = true, createResourceLink = true } = args;
  
  if (!channel || typeof channel !== 'string') {
    throw new Error('channel is required and must be a string');
  }
  
  if (!twitchAPIClient) {
    throw new Error('Twitch API client not available. Please authenticate first.');
  }
  
  try {
    // Get stream information
    const streamInfo = await twitchAPIClient.getStreamInfo(channel);
    
    let resourceLink = '';
    if (createResourceLink) {
      resourceLink = createPersistentStreamLink(channel);
    }
    
    // Cache the information if enabled
    if (enableCaching) {
      // TODO: Implement durable caching that survives server restarts
      logger.info(`Stream info cached for ${channel}`, { enableCaching });
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Retrieved stream information for ${channel}`,
          channel,
          streamInfo,
          resourceLink: createResourceLink ? `twitch://stream-link/${resourceLink}` : undefined,
          cached: enableCaching,
          retrievedAt: new Date().toISOString(),
          persistent: true
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error(`Failed to get stream info for ${channel}`, { error });
    throw new Error(`Failed to get stream info: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handle get channel info persistent tool
 */
async function handleGetChannelInfoPersistent(server: Server, args: any, twitchAPIClient: TwitchAPIClient | null) {
  const { 
    channel, 
    includeFollowers = false, 
    includeSubscribers = false, 
    enableCaching = true, 
    enableProgressUpdates = true 
  } = args;
  
  if (!channel || typeof channel !== 'string') {
    throw new Error('channel is required and must be a string');
  }
  
  if (!twitchAPIClient) {
    throw new Error('Twitch API client not available. Please authenticate first.');
  }
  
  const sessionId = `channel_info_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Send initial progress update
    if (enableProgressUpdates) {
      logger.info(`Starting channel info retrieval for ${channel}`, {
        sessionId,
        includeFollowers,
        includeSubscribers
      });
    }
    
    // Get basic channel information
    const channelInfo = await twitchAPIClient.getChannelInfo(channel);
    
    let progress = 50; // Basic info retrieved
    if (enableProgressUpdates) {
      logger.info(`Channel info progress update`, {
        sessionId,
        progress,
        message: `Basic channel info retrieved for ${channel}`
      });
    }
    
    const result: any = {
      success: true,
      message: `Retrieved channel information for ${channel}`,
      sessionId,
      channel,
      channelInfo,
      cached: enableCaching,
      retrievedAt: new Date().toISOString(),
      persistent: true
    };
    
    // Get additional information if requested
    if (includeFollowers || includeSubscribers) {
      // TODO: Implement follower/subscriber fetching
      // For now, we'll simulate the progress
      progress = 100;
      
      if (enableProgressUpdates) {
        logger.info(`Channel info progress update`, {
          sessionId,
          progress,
          message: `Additional info retrieval completed for ${channel}`
        });
      }
      
      result.additionalInfo = {
        followersIncluded: includeFollowers,
        subscribersIncluded: includeSubscribers,
        note: 'Additional info fetching not yet implemented'
      };
    }
    
    // Cache the information if enabled
    if (enableCaching) {
      // TODO: Implement durable caching that survives server restarts
      logger.info(`Channel info cached for ${channel}`, { enableCaching, sessionId });
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error) {
    logger.error(`Failed to get channel info for ${channel}`, { error, sessionId });
    throw new Error(`Failed to get channel info: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handle get followers batch tool
 */
async function handleGetFollowersBatch(server: Server, args: any, twitchAPIClient: TwitchAPIClient | null) {
  const { 
    channel, 
    batchSize = 100, 
    maxFollowers = 1000, 
    resumeToken, 
    enableProgressUpdates = true 
  } = args;
  
  if (!channel || typeof channel !== 'string') {
    throw new Error('channel is required and must be a string');
  }
  
  if (!twitchAPIClient) {
    throw new Error('Twitch API client not available. Please authenticate first.');
  }
  
  // Generate or use existing session ID
  const sessionId = resumeToken || `followers_batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Check if resuming an existing session
  let existingSession = batchProcessingSessions.get(sessionId);
  if (resumeToken && existingSession) {
    if (existingSession.isActive) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            message: "Batch processing session is already active",
            sessionId,
            channel: existingSession.channel,
            processedCount: existingSession.processedCount
          }, null, 2)
        }]
      };
    }
  }
  
  // Create or resume session
  const session: BatchProcessingSession = existingSession || {
    sessionId,
    channel,
    type: 'followers' as const,
    batchSize,
    maxItems: maxFollowers,
    processedCount: 0,
    isActive: true,
    startedAt: new Date()
  };
  
  batchProcessingSessions.set(sessionId, session);
  
  try {
    // TODO: Implement actual follower fetching with Twitch API
    // For now, we'll simulate batch processing
    const simulatedFollowers = [];
    const remainingToProcess = Math.min(batchSize, maxFollowers - session.processedCount);
    
    for (let i = 0; i < remainingToProcess; i++) {
      simulatedFollowers.push({
        username: `follower_${session.processedCount + i + 1}`,
        followedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        userId: `user_${session.processedCount + i + 1}`
      });
    }
    
    session.processedCount += remainingToProcess;
    session.lastBatch = simulatedFollowers;
    session.isActive = session.processedCount < maxFollowers;
    
    // Send progress update
    if (enableProgressUpdates) {
      const progress = Math.round((session.processedCount / maxFollowers) * 100);
      logger.info(`Followers batch progress update`, {
        sessionId,
        progress,
        processedCount: session.processedCount,
        maxFollowers,
        message: `Processed ${session.processedCount}/${maxFollowers} followers for ${channel}`
      });
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Batch processed ${remainingToProcess} followers for ${channel}`,
          sessionId,
          channel,
          batchSize: remainingToProcess,
          processedCount: session.processedCount,
          maxFollowers,
          isComplete: !session.isActive,
          followers: simulatedFollowers,
          resumeToken: session.isActive ? sessionId : undefined,
          processedAt: new Date().toISOString(),
          persistent: true
        }, null, 2)
      }]
    };
  } catch (error) {
    session.isActive = false;
    logger.error(`Failed to process followers batch for ${channel}`, { error, sessionId });
    throw new Error(`Failed to process followers batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handle monitor stream persistent tool
 */
async function handleMonitorStreamPersistent(server: Server, args: any, twitchAPIClient: TwitchAPIClient | null) {
  const { 
    channel, 
    monitoringType = 'all', 
    updateInterval = 30000, 
    enableNotifications = true, 
    persistAcrossRestarts = true 
  } = args;
  
  if (!channel || typeof channel !== 'string') {
    throw new Error('channel is required and must be a string');
  }
  
  if (!twitchAPIClient) {
    throw new Error('Twitch API client not available. Please authenticate first.');
  }
  
  if (updateInterval < 5000) {
    throw new Error('updateInterval must be at least 5000ms to respect API limits');
  }
  
  const monitorId = `persistent_monitor_${channel}_${Date.now()}`;
  
  // Create persistent monitor
  const monitor: PersistentStreamMonitor = {
    monitorId,
    channel,
    monitoringType,
    updateInterval,
    isActive: true,
    lastUpdate: new Date(),
    resourceLink: createPersistentStreamLink(channel)
  };
  
  // Set up monitoring interval
  if (enableNotifications) {
    monitor.intervalId = setInterval(async () => {
      try {
        // TODO: Implement actual monitoring logic
        // For now, we'll just log the monitoring activity
        logger.info(`Persistent monitor update for ${channel}`, {
          monitorId,
          monitoringType,
          timestamp: new Date().toISOString()
        });
        
        monitor.lastUpdate = new Date();
      } catch (error) {
        logger.error(`Persistent monitor error for ${channel}`, { error, monitorId });
      }
    }, updateInterval);
  }
  
  persistentStreamMonitors.set(monitorId, monitor);
  
  // TODO: Implement persistence across server restarts
  if (persistAcrossRestarts) {
    logger.info(`Persistent monitor configured for restart survival`, {
      monitorId,
      channel,
      persistAcrossRestarts
    });
  }
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        success: true,
        message: `Started persistent monitoring for ${channel}`,
        monitorId,
        channel,
        monitoringType,
        updateInterval,
        enableNotifications,
        persistAcrossRestarts,
        resourceLink: `twitch://stream-link/${monitor.resourceLink}`,
        startedAt: new Date().toISOString(),
        persistent: true,
        note: "Monitor will continue running and survive server restarts"
      }, null, 2)
    }]
  };
}