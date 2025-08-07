// MCP-related type definitions

export interface MCPResource {
  uri: string;
  name: string;
  mimeType: string;
  data: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

export interface MCPRequest {
  method: string;
  params?: any;
}

export interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface StreamResource extends MCPResource {
  uri: `twitch://stream/${string}`;
  name: "Stream Information";
  mimeType: "application/json";
  data: {
    isLive: boolean;
    viewerCount: number;
    game: string;
    title: string;
    startedAt?: string;
  };
}

export interface ChatHistoryResource extends MCPResource {
  uri: `twitch://chat/${string}/history`;
  name: "Recent Chat Messages";
  mimeType: "application/json";
  data: {
    messages: Array<{
      username: string;
      message: string;
      timestamp: string;
      badges: string[];
    }>;
    totalMessages: number;
    timeframe: string;
  };
}