import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TwitchClient } from '../twitch/twitchIntegration';
import { setupLogger } from '../utils/logger';
import NodeCache from 'node-cache';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = setupLogger();

// Persistent storage directory
const STORAGE_DIR = path.join(process.cwd(), 'data', 'chat-history');

// Cache for recent chat messages with longer TTL
const chatCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes TTL for chat data
  checkperiod: 60, // Check for expired keys every minute
  useClones: false
});

// Event emitter for chat analytics updates
const chatEmitter = new EventEmitter();

// Active chat monitoring sessions
const activeChatSessions = new Map<string, {
  channelName: string;
  startTime: Date;
  messageCount: number;
  lastActivity: Date;
  isRecording: boolean;
  analyticsInProgress: boolean;
}>();

// Persistent resource links for chat history
const chatResourceLinks = new Map<string, {
  uri: string;
  channelName: string;
  timeframe: string;
  createdAt: Date;
  lastAccessed: Date;
  filePath: string;
}>();

// Analytics processing queue
const analyticsQueue = new Map<string, {
  channelName: string;
  timeframe: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}>();

export interface ChatMessage {
  username: string;
  message: string;
  timestamp: string;
  badges: string[];
  emotes?: string[];
  messageId?: string;
}

export interface ChatHistoryData {
  messages: ChatMessage[];
  totalMessages: number;
  timeframe: string;
  channelName: string;
  startTime: string;
  endTime: string;
  lastUpdated: string;
  analytics?: ChatAnalytics;
}

export interface ChatAnalytics {
  messageFrequency: { [hour: string]: number };
  topChatters: { username: string; messageCount: number }[];
  commonWords: { word: string; count: number }[];
  emoteUsage: { emote: string; count: number }[];
  averageMessageLength: number;
  uniqueChatters: number;
  peakActivity: { time: string; messagesPerMinute: number };
  sentiment?: 'positive' | 'neutral' | 'negative';
}

/**
 * Setup MCP resources for chat history with persistent analytics
 */
export function setupChatResources(server: Server, twitchClient: TwitchClient | null) {
  // Ensure storage directory exists
  initializeStorage();
  
  // List available chat resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = [
      {
        uri: "twitch://chat/monitor",
        name: "Chat Monitoring Dashboard",
        description: "Monitor active chat recording sessions and analytics",
        mimeType: "application/json"
      }
    ];

    // Add individual chat history resources for active sessions
    for (const [sessionKey, session] of activeChatSessions) {
      resources.push({
        uri: `twitch://chat/${session.channelName}/live`,
        name: `Live Chat: ${session.channelName}`,
        description: `Real-time chat messages for ${session.channelName}`,
        mimeType: "application/json"
      });
    }

    // Add persistent chat history links
    for (const [linkId, link] of chatResourceLinks) {
      resources.push({
        uri: link.uri,
        name: `Chat History: ${link.channelName} (${link.timeframe})`,
        description: `Persistent chat history and analytics for ${link.channelName}`,
        mimeType: "application/json"
      });
    }

    // Add analytics resources
    for (const [taskId, task] of analyticsQueue) {
      resources.push({
        uri: `twitch://chat/analytics/${taskId}`,
        name: `Analytics: ${task.channelName}`,
        description: `Chat analytics for ${task.channelName} - Status: ${task.status}`,
        mimeType: "application/json"
      });
    }

    return { resources };
  });

  // Read resource content
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    
    try {
      if (uri === "twitch://chat/monitor") {
        return await handleChatMonitorResource();
      }
      
      if (uri.startsWith("twitch://chat/") && uri.endsWith("/live")) {
        const channelName = uri.replace("twitch://chat/", "").replace("/live", "");
        return await handleLiveChatResource(channelName, twitchClient);
      }
      
      if (uri.startsWith("twitch://chat/history/")) {
        const linkId = uri.replace("twitch://chat/history/", "");
        return await handlePersistentChatHistory(linkId);
      }
      
      if (uri.startsWith("twitch://chat/analytics/")) {
        const taskId = uri.replace("twitch://chat/analytics/", "");
        return await handleAnalyticsResource(taskId);
      }
      
      throw new Error(`Unknown chat resource URI: ${uri}`);
    } catch (error) {
      logger.error(`Failed to read chat resource ${uri}`, { error });
      throw error;
    }
  });

  // Setup chat monitoring if Twitch client is available
  if (twitchClient) {
    setupChatMonitoring(twitchClient);
  }
  
  logger.info('Chat resources initialized with persistent storage and analytics');
}

/**
 * Initialize storage directory
 */
async function initializeStorage() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    logger.info('Chat storage directory initialized', { path: STORAGE_DIR });
  } catch (error) {
    logger.error('Failed to initialize storage directory', { error });
  }
}

/**
 * Handle chat monitoring dashboard resource
 */
async function handleChatMonitorResource() {
  const sessions = Array.from(activeChatSessions.entries()).map(([key, session]) => ({
    sessionKey: key,
    channelName: session.channelName,
    startTime: session.startTime.toISOString(),
    messageCount: session.messageCount,
    lastActivity: session.lastActivity.toISOString(),
    isRecording: session.isRecording,
    analyticsInProgress: session.analyticsInProgress,
    duration: Date.now() - session.startTime.getTime()
  }));

  const analytics = Array.from(analyticsQueue.entries()).map(([taskId, task]) => ({
    taskId,
    channelName: task.channelName,
    timeframe: task.timeframe,
    status: task.status,
    progress: task.progress,
    startedAt: task.startedAt.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    error: task.error
  }));

  return {
    contents: [{
      uri: "twitch://chat/monitor",
      mimeType: "application/json",
      text: JSON.stringify({
        activeSessions: sessions,
        totalSessions: sessions.length,
        analyticsQueue: analytics,
        persistentLinks: chatResourceLinks.size,
        cacheStats: {
          keys: chatCache.keys().length,
          hits: chatCache.getStats().hits,
          misses: chatCache.getStats().misses
        },
        storageInfo: {
          directory: STORAGE_DIR,
          totalFiles: await countStorageFiles()
        },
        lastUpdated: new Date().toISOString()
      }, null, 2)
    }]
  };
}

/**
 * Handle live chat resource
 */
async function handleLiveChatResource(channelName: string, twitchClient: TwitchClient | null): Promise<any> {
  if (!twitchClient) {
    throw new Error('Twitch client not available for live chat monitoring');
  }

  const cacheKey = `chat:${channelName.toLowerCase()}`;
  
  // Try to get from cache first
  let chatData = chatCache.get<ChatHistoryData>(cacheKey);
  
  if (!chatData) {
    // Get recent chat messages
    try {
      const messages = await twitchClient.observeChat(channelName, 30000); // 30 seconds
      
      chatData = {
        messages: messages.map(msg => ({
          username: msg.username,
          message: msg.message,
          timestamp: msg.timestamp.toISOString(),
          badges: [], // TODO: Extract badges from TMI
          emotes: extractEmotes(msg.message)
        })),
        totalMessages: messages.length,
        timeframe: "last_30_seconds",
        channelName,
        startTime: new Date(Date.now() - 30000).toISOString(),
        endTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      
      // Cache the data
      chatCache.set(cacheKey, chatData);
      
      // Update session info if exists
      const session = activeChatSessions.get(channelName.toLowerCase());
      if (session) {
        session.messageCount += messages.length;
        session.lastActivity = new Date();
      }
      
    } catch (error) {
      logger.error(`Failed to fetch live chat for ${channelName}`, { error });
      
      chatData = {
        messages: [],
        totalMessages: 0,
        timeframe: "error",
        channelName,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
    }
  }
  
  return {
    contents: [{
      uri: `twitch://chat/${channelName}/live`,
      mimeType: "application/json",
      text: JSON.stringify(chatData, null, 2)
    }]
  };
}

/**
 * Handle persistent chat history resource
 */
async function handlePersistentChatHistory(linkId: string): Promise<any> {
  const link = chatResourceLinks.get(linkId);
  
  if (!link) {
    throw new Error(`Chat history link ${linkId} not found`);
  }
  
  // Update last accessed time
  link.lastAccessed = new Date();
  
  try {
    // Read from persistent storage
    const data = await fs.readFile(link.filePath, 'utf-8');
    const chatHistory: ChatHistoryData = JSON.parse(data);
    
    return {
      contents: [{
        uri: link.uri,
        mimeType: "application/json",
        text: JSON.stringify({
          ...chatHistory,
          linkInfo: {
            linkId,
            createdAt: link.createdAt.toISOString(),
            lastAccessed: link.lastAccessed.toISOString(),
            persistent: true
          }
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error(`Failed to read persistent chat history ${linkId}`, { error });
    throw new Error(`Failed to read chat history: ${error}`);
  }
}

/**
 * Handle analytics resource
 */
async function handleAnalyticsResource(taskId: string): Promise<any> {
  const task = analyticsQueue.get(taskId);
  
  if (!task) {
    throw new Error(`Analytics task ${taskId} not found`);
  }
  
  return {
    contents: [{
      uri: `twitch://chat/analytics/${taskId}`,
      mimeType: "application/json",
      text: JSON.stringify({
        taskId,
        channelName: task.channelName,
        timeframe: task.timeframe,
        status: task.status,
        progress: task.progress,
        startedAt: task.startedAt.toISOString(),
        completedAt: task.completedAt?.toISOString(),
        result: task.result,
        error: task.error,
        estimatedCompletion: task.status === 'processing' ? 
          new Date(Date.now() + (60000 * (100 - task.progress))).toISOString() : null
      }, null, 2)
    }]
  };
}

/**
 * Start chat recording session
 */
export function startChatRecording(channelName: string): string {
  const sessionKey = channelName.toLowerCase();
  
  const session = {
    channelName,
    startTime: new Date(),
    messageCount: 0,
    lastActivity: new Date(),
    isRecording: true,
    analyticsInProgress: false
  };
  
  activeChatSessions.set(sessionKey, session);
  
  logger.info(`Started chat recording for ${channelName}`, { sessionKey });
  
  return sessionKey;
}

/**
 * Stop chat recording session
 */
export function stopChatRecording(channelName: string): boolean {
  const sessionKey = channelName.toLowerCase();
  const session = activeChatSessions.get(sessionKey);
  
  if (session) {
    session.isRecording = false;
    activeChatSessions.delete(sessionKey);
    
    logger.info(`Stopped chat recording for ${channelName}`, {
      duration: Date.now() - session.startTime.getTime(),
      messageCount: session.messageCount
    });
    
    return true;
  }
  
  return false;
}

/**
 * Create persistent chat history link
 */
export async function createPersistentChatHistory(
  channelName: string, 
  timeframe: string, 
  messages: ChatMessage[]
): Promise<string> {
  const linkId = `${channelName.toLowerCase()}-${timeframe}-${Date.now()}`;
  const fileName = `${linkId}.json`;
  const filePath = path.join(STORAGE_DIR, fileName);
  
  const chatHistory: ChatHistoryData = {
    messages,
    totalMessages: messages.length,
    timeframe,
    channelName,
    startTime: messages[0]?.timestamp || new Date().toISOString(),
    endTime: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    analytics: await generateChatAnalytics(messages)
  };
  
  try {
    // Save to persistent storage
    await fs.writeFile(filePath, JSON.stringify(chatHistory, null, 2));
    
    const link = {
      uri: `twitch://chat/history/${linkId}`,
      channelName,
      timeframe,
      createdAt: new Date(),
      lastAccessed: new Date(),
      filePath
    };
    
    chatResourceLinks.set(linkId, link);
    
    logger.info(`Created persistent chat history for ${channelName}`, { 
      linkId, 
      messageCount: messages.length,
      timeframe 
    });
    
    return linkId;
  } catch (error) {
    logger.error(`Failed to create persistent chat history for ${channelName}`, { error });
    throw error;
  }
}

// Counter for unique task IDs
let analyticsTaskCounter = 0;

/**
 * Start analytics processing
 */
export function startAnalyticsProcessing(channelName: string, timeframe: string): string {
  const taskId = `analytics-${channelName.toLowerCase()}-${Date.now()}-${++analyticsTaskCounter}`;
  
  const task = {
    channelName,
    timeframe,
    status: 'pending' as const,
    progress: 0,
    startedAt: new Date()
  };
  
  analyticsQueue.set(taskId, task);
  
  // Start processing asynchronously
  processAnalytics(taskId);
  
  logger.info(`Started analytics processing for ${channelName}`, { taskId, timeframe });
  
  return taskId;
}

/**
 * Process analytics with progress updates
 */
async function processAnalytics(taskId: string) {
  const task = analyticsQueue.get(taskId);
  if (!task) return;
  
  try {
    task.status = 'processing';
    task.progress = 10;
    
    // Emit progress update
    chatEmitter.emit('analyticsProgress', { taskId, progress: task.progress });
    
    // Simulate processing steps with progress updates
    await new Promise(resolve => setTimeout(resolve, 1000));
    task.progress = 30;
    chatEmitter.emit('analyticsProgress', { taskId, progress: task.progress });
    
    // Load chat data for analysis
    const chatData = await loadChatDataForAnalytics(task.channelName, task.timeframe);
    task.progress = 50;
    chatEmitter.emit('analyticsProgress', { taskId, progress: task.progress });
    
    // Generate analytics
    const analytics = await generateChatAnalytics(chatData);
    task.progress = 80;
    chatEmitter.emit('analyticsProgress', { taskId, progress: task.progress });
    
    // Finalize
    task.result = analytics;
    task.status = 'completed';
    task.progress = 100;
    task.completedAt = new Date();
    
    chatEmitter.emit('analyticsComplete', { taskId, result: analytics });
    
    logger.info(`Analytics processing completed for ${task.channelName}`, { taskId });
    
  } catch (error) {
    task.status = 'failed';
    task.error = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error(`Analytics processing failed for ${task.channelName}`, { taskId, error });
    
    chatEmitter.emit('analyticsError', { taskId, error: task.error });
  }
}

/**
 * Generate chat analytics from messages
 */
async function generateChatAnalytics(messages: ChatMessage[]): Promise<ChatAnalytics> {
  if (messages.length === 0) {
    return {
      messageFrequency: {},
      topChatters: [],
      commonWords: [],
      emoteUsage: [],
      averageMessageLength: 0,
      uniqueChatters: 0,
      peakActivity: { time: new Date().toISOString(), messagesPerMinute: 0 }
    };
  }
  
  // Message frequency by hour
  const messageFrequency: { [hour: string]: number } = {};
  messages.forEach(msg => {
    const hour = new Date(msg.timestamp).getHours().toString();
    messageFrequency[hour] = (messageFrequency[hour] || 0) + 1;
  });
  
  // Top chatters
  const chatterCounts: { [username: string]: number } = {};
  messages.forEach(msg => {
    chatterCounts[msg.username] = (chatterCounts[msg.username] || 0) + 1;
  });
  
  const topChatters = Object.entries(chatterCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([username, messageCount]) => ({ username, messageCount }));
  
  // Common words (simple implementation)
  const wordCounts: { [word: string]: number } = {};
  messages.forEach(msg => {
    const words = msg.message.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });
  
  const commonWords = Object.entries(wordCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
  
  // Emote usage
  const emoteCounts: { [emote: string]: number } = {};
  messages.forEach(msg => {
    if (msg.emotes) {
      msg.emotes.forEach(emote => {
        emoteCounts[emote] = (emoteCounts[emote] || 0) + 1;
      });
    }
  });
  
  const emoteUsage = Object.entries(emoteCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([emote, count]) => ({ emote, count }));
  
  // Calculate other metrics
  const averageMessageLength = messages.reduce((sum, msg) => sum + msg.message.length, 0) / messages.length;
  const uniqueChatters = Object.keys(chatterCounts).length;
  
  // Peak activity (simplified)
  const peakHour = Object.entries(messageFrequency)
    .sort(([,a], [,b]) => b - a)[0];
  
  const peakActivity = {
    time: `${peakHour?.[0] || '0'}:00`,
    messagesPerMinute: Math.round((peakHour?.[1] || 0) / 60)
  };
  
  return {
    messageFrequency,
    topChatters,
    commonWords,
    emoteUsage,
    averageMessageLength: Math.round(averageMessageLength),
    uniqueChatters,
    peakActivity
  };
}

/**
 * Extract emotes from message (simple implementation)
 */
function extractEmotes(message: string): string[] {
  // Simple emote detection - in real implementation, use Twitch emote API
  const emotePattern = /:\w+:/g;
  const matches = message.match(emotePattern);
  return matches || [];
}

/**
 * Load chat data for analytics
 */
async function loadChatDataForAnalytics(channelName: string, timeframe: string): Promise<ChatMessage[]> {
  // In a real implementation, this would load from database or files
  // For now, return empty array
  return [];
}

/**
 * Count storage files
 */
async function countStorageFiles(): Promise<number> {
  try {
    const files = await fs.readdir(STORAGE_DIR);
    return files.filter(file => file.endsWith('.json')).length;
  } catch (error) {
    return 0;
  }
}

/**
 * Setup chat monitoring
 */
function setupChatMonitoring(twitchClient: TwitchClient) {
  // Cleanup old analytics tasks every hour
  setInterval(() => {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [taskId, task] of analyticsQueue) {
      if (now.getTime() - task.startedAt.getTime() > maxAge) {
        analyticsQueue.delete(taskId);
        logger.debug(`Cleaned up old analytics task ${taskId}`);
      }
    }
  }, 60 * 60 * 1000);
  
  logger.info('Chat monitoring setup completed');
}

/**
 * Cleanup chat resources
 */
export function cleanupChatResources(): void {
  // Stop all recording sessions
  for (const [sessionKey] of activeChatSessions) {
    stopChatRecording(sessionKey);
  }
  
  // Clear caches
  chatCache.flushAll();
  
  // Clear resource links
  chatResourceLinks.clear();
  
  // Clear analytics queue
  analyticsQueue.clear();
  
  // Reset counter
  analyticsTaskCounter = 0;
  
  // Remove all event listeners
  chatEmitter.removeAllListeners();
  
  logger.info('Chat resources cleaned up');
}