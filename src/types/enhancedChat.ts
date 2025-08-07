// Enhanced chat interaction types for MCP tools
import { ChatMessage } from '../twitch/twitchIntegration';

export interface ChatObservationSession {
  sessionId: string;
  channel: string;
  startTime: Date;
  duration: number;
  messages: ChatMessage[];
  isActive: boolean;
  progressCallback?: (progress: number, messages: ChatMessage[]) => void;
}

export interface ChatCommand {
  command: string;
  username: string;
  args: string[];
  timestamp: Date;
  aiResponse?: string;
}

export interface ModerationWorkflow {
  workflowId: string;
  channel: string;
  action: 'timeout' | 'ban' | 'delete_message' | 'warn_user';
  target: string;
  reason: string;
  duration?: number;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executed';
  createdAt: Date;
}

export interface StreamingProgress {
  progressToken: string;
  progress: number;
  total: number;
  message: string;
}

export interface ElicitationRequest {
  prompt: string;
  expectedResponses?: string[];
  timeout?: number;
}

export interface SamplingRequest {
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text';
      text: string;
    };
  }>;
  maxTokens: number;
  temperature: number;
}

// Re-export ChatMessage from twitch integration
export { ChatMessage };