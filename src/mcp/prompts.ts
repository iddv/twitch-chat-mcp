import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  GetPromptRequestSchema,
  ListPromptsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TwitchAPIClient } from '../twitch/apiClient';
import { setupLogger } from '../utils/logger';

const logger = setupLogger();

/**
 * Setup MCP prompts for stream analysis
 */
export function setupStreamPrompts(server: Server, twitchClient: TwitchAPIClient | null) {
  // List available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const prompts = [
      {
        name: "analyze_stream_data",
        description: "Analyze stream information and provide insights",
        arguments: [
          {
            name: "streamData",
            description: "Stream information data to analyze",
            required: true
          },
          {
            name: "analysisType",
            description: "Type of analysis to perform (performance, engagement, trends)",
            required: false
          }
        ]
      },
      {
        name: "stream_context_summary",
        description: "Provide contextual summary of current stream status",
        arguments: [
          {
            name: "channelName",
            description: "The channel name to summarize",
            required: true
          },
          {
            name: "includeHistory",
            description: "Whether to include historical context",
            required: false
          }
        ]
      }
    ];

    return { prompts };
  });

  // Handle prompt requests
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "analyze_stream_data":
          return await handleAnalyzeStreamData(args);
          
        case "stream_context_summary":
          return await handleStreamContextSummary(args);
          
        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    } catch (error) {
      logger.error(`Prompt execution failed: ${name}`, { error, args });
      throw error;
    }
  });

  logger.info('Stream prompts initialized');
}

/**
 * Handle analyze stream data prompt
 */
async function handleAnalyzeStreamData(args: any) {
  const { streamData, analysisType = "general" } = args;
  
  if (!streamData) {
    throw new Error('streamData is required');
  }
  
  let analysisPrompt = "";
  
  switch (analysisType) {
    case "performance":
      analysisPrompt = `Analyze the following Twitch stream performance data and provide insights on viewer engagement, growth trends, and optimization opportunities:

Stream Data:
${JSON.stringify(streamData, null, 2)}

Please focus on:
1. Viewer count trends and patterns
2. Stream duration and consistency
3. Game/category performance
4. Peak viewing times
5. Recommendations for improvement`;
      break;
      
    case "engagement":
      analysisPrompt = `Analyze the following Twitch stream data for audience engagement insights:

Stream Data:
${JSON.stringify(streamData, null, 2)}

Please focus on:
1. Audience retention indicators
2. Interactive elements effectiveness
3. Content engagement patterns
4. Community building opportunities
5. Engagement optimization strategies`;
      break;
      
    case "trends":
      analysisPrompt = `Analyze the following Twitch stream data for trending patterns and market insights:

Stream Data:
${JSON.stringify(streamData, null, 2)}

Please focus on:
1. Category/game trending analysis
2. Timing and scheduling patterns
3. Competitive landscape insights
4. Growth opportunity identification
5. Market positioning recommendations`;
      break;
      
    default:
      analysisPrompt = `Analyze the following Twitch stream data and provide comprehensive insights:

Stream Data:
${JSON.stringify(streamData, null, 2)}

Please provide:
1. Overall stream health assessment
2. Key performance indicators
3. Audience engagement analysis
4. Content strategy insights
5. Actionable recommendations for improvement`;
  }
  
  return {
    description: `Stream data analysis (${analysisType})`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: analysisPrompt
        }
      }
    ]
  };
}

/**
 * Handle stream context summary prompt
 */
async function handleStreamContextSummary(args: any) {
  const { channelName, includeHistory = false } = args;
  
  if (!channelName) {
    throw new Error('channelName is required');
  }
  
  const contextPrompt = `Provide a comprehensive context summary for the Twitch channel "${channelName}".

Please include:
1. Current stream status (live/offline)
2. Recent streaming activity and patterns
3. Content category and focus areas
4. Community size and engagement level
5. Notable recent events or milestones
${includeHistory ? '6. Historical performance trends\n7. Long-term growth patterns\n8. Seasonal or cyclical behaviors' : ''}

Use the available stream resources and monitoring data to provide accurate, up-to-date information. If specific data is not available, indicate what information would be helpful to gather.

Channel: ${channelName}
Include History: ${includeHistory}
Analysis Timestamp: ${new Date().toISOString()}`;
  
  return {
    description: `Stream context summary for ${channelName}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: contextPrompt
        }
      }
    ]
  };
}