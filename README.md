# Twitch Chat MCP Server

A Model Context Protocol (MCP) server that connects MCP Clients, like Claude Desktop, Amazon Q CLI or Stands agent with Twitch chat, allowing the agent to interact with Twitch chat.

## Available Tools

### 🎮 Stream Information & Monitoring
`start_stream_monitoring` - Start real-time monitoring of a Twitch stream with automatic updates
`stop_stream_monitoring` - Stop real-time monitoring of a Twitch stream
`get_stream_info_persistent` - Get stream information with resource links for continuous monitoring
`get_channel_info_persistent` - Get channel information with durable caching and progress updates
`create_stream_link` - Create a persistent resource link for long-term stream access
`monitor_stream_persisten`t - Create persistent monitoring tools that survive server restarts
`get_monitoring_status` - Get the current status of all stream monitoring sessions

###💬 Chat Interaction & Analysis
`observe_twitch_chat_streaming` - Observe Twitch chat with real-time progress streaming and resumability
`send_twitch_message_with_confirmation` - Send a message to Twitch chat with user confirmation via elicitation
`detect_chat_commands` - Detect and analyze chat commands with AI-powered response generation
`start_chat_recording` - Start recording chat messages for a channel with persistent storage
`stop_chat_recording` - Stop recording chat messages for a channel
`create_chat_history_link` - Create a persistent link for chat history with analytics
`start_chat_analytics` - Start processing chat analytics for a channel and timeframe

### 👥 Community & Moderation
`moderate_chat_with_approval` - Multi-turn moderation workflow with user approval for actions
`get_followers_batch` - Retrieve followers with resumable batch processing

###🔐 Authentication & Setup
authenticate_twitch - Start Twitch OAuth authentication flow to enable full API access

## 🚀 Status

**✅ MCP Server Fully Operational**: Successfully tested with live Twitch integration!

**✅ Verified Features**:
- ✅ **Real-time Stream Data**: Live stream info, viewer counts, game titles
- ✅ **Chat Reading**: Successfully reading live chat messages from active streams  
- ✅ **Command Detection**: AI-powered chat command monitoring and analysis
- ✅ **Session Management**: Persistent state, resume tokens, resource links
- ✅ **MCP Integration**: Full protocol compliance with Kiro/Claude Desktop
- ✅ **OAuth Authentication**: One-time manual setup working perfectly

**🧪 Live Testing Results**:
- **Stream**: odpixel (Dota 2, 617 viewers) ✅
- **Chat Messages**: Successfully captured live chat ✅  
- **API Integration**: Real Twitch API data ✅
- **Tools**: All enhanced MCP tools functional ✅

**Quick Start**: Follow the setup guide below to get your own Twitch token!

## 🚀 Quick Setup for MCP

### 1. Get Twitch Credentials

1. **Create Twitch App**:
   - Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
   - Click "Register Your Application"
   - Name: `Your MCP Server` (or any name)
   - OAuth Redirect URLs: `https://twitchtokengenerator.com`
   - Category: `Application Integration`
   - Copy your **Client ID**

2. **Get OAuth Token**:
   - Visit: `https://twitchtokengenerator.com/quick/YOUR_CLIENT_ID`
   - Replace `YOUR_CLIENT_ID` with your actual Client ID
   - Click "Connect" and authorize
   - Copy the generated token (starts with `oauth:`)

### 2. Configure MCP Server

Add your credentials to `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "twitch-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/twitch-chat-mcp/dist/src/index.js"],
      "env": {
        "NODE_ENV": "production",
        "LOG_LEVEL": "info",
        "TWITCH_CLIENT_ID": "your_client_id_here",
        "TWITCH_OAUTH_TOKEN": "oauth:your_token_here"
      },
      "disabled": false,
      "autoApprove": [
        "start_stream_monitoring",
        "get_stream_info_persistent",
        "observe_twitch_chat_streaming",
        "detect_chat_commands"
      ]
    }
  }
}
```

### 3. Build and Test

```bash
npm run build
npm run mcp:test
```

### 4. Restart MCP Client

Restart Kiro/Claude Desktop to connect with full Twitch functionality!

## Features

- Connect with Claude desktop via HTTP API
- Authenticate with Twitch API (browser-based OAuth flow)
- Observe Twitch chat in specified channels
- Send messages to Twitch chat
- Parse user queries to determine relevant Twitch channels
- Provide summaries of chat activity

## Project Structure

- `docs/` - Documentation
  - `architecture.md` - System architecture
  - `decisions.md` - Decision log
  - `challenges.md` - Implementation challenges
- `src/` - Source code
  - `mcp/` - MCP server components
  - `twitch/` - Twitch integration components
  - `claude/` - Claude integration components
  - `tools/` - Tool definitions for Claude
- `tests/` - Test suite
- `config/` - Configuration files
- `public/` - Web UI for authentication
- `llm/` - LLM-related files
  - `seed_prompt.md` - Original development prompt

## Setup

1. Create a Twitch application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps)
   - Set the OAuth Redirect URL to `http://localhost:3000/auth/twitch/callback`
   - Note your Client ID

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the example environment file and fill in your Twitch app details:
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` with at least your Twitch Client ID:
   ```
   TWITCH_CLIENT_ID=your_client_id_from_twitch_dev_console
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Start the server:
   ```bash
   npm start
   ```

6. Open your browser and go to `http://localhost:3000`

7. Click "Login with Twitch" to authenticate the application

## Authentication

The application supports two ways to authenticate with Twitch:

### 1. Browser-based OAuth Flow (Recommended)

1. Start the server
2. Visit `http://localhost:3000` in your browser
3. Click "Login with Twitch"
4. Follow the Twitch authentication process
5. After successful authentication, the token will be stored in the session

### 2. Manual Token Configuration

If you prefer to set up manually:

1. Get an OAuth token from [Twitch Token Generator](https://twitchtokengenerator.com/)
   - Make sure to request `chat:read` and `chat:write` scopes
2. Add the token to your `.env` file:
   ```
   TWITCH_OAUTH_TOKEN=oauth:your_token_here
   TWITCH_USERNAME=your_bot_username
   ```

## Development

Run in development mode with automatic reloading:
```bash
npm run dev
```

Run linting:
```bash
npm run lint
```

Run tests:
```bash
npm test
```

## API Endpoints

### Authentication

```
GET /auth/twitch/login     # Redirects to Twitch for authorization
GET /auth/twitch/status    # Returns current authentication status
GET /auth/twitch/logout    # Logs out and clears the session
```

### Tool Definitions

```
GET /tools/definitions
```

Returns the available tools and their parameter definitions.

### Tool Execution

```
POST /tools/execute
```

Execute a tool with the specified parameters.

Example:
```json
{
  "name": "observe_twitch_chat",
  "parameters": {
    "channel": "xqc",
    "duration": 60000
  }
}
```

## MCP Client Integration

This server is designed to work as an MCP (Model Context Protocol) server with Claude Desktop or other MCP clients.

### Quick Setup

1. **Configure Environment** (Interactive):
   ```bash
   npm run setup
   ```

2. **Build the Project**:
   ```bash
   npm run mcp:build
   ```

3. **Configure MCP Client**: The server is pre-configured in `.kiro/settings/mcp.json`. If using Claude Desktop, add this to your MCP configuration:

   ```json
   {
     "mcpServers": {
       "twitch-mcp": {
         "command": "node",
         "args": ["dist/src/index.js"],
         "cwd": "/path/to/twitch-chat-mcp",
         "env": {
           "NODE_ENV": "production",
           "LOG_LEVEL": "info"
         },
         "disabled": false,
         "autoApprove": [
           "start_stream_monitoring",
           "get_stream_info_persistent", 
           "observe_twitch_chat_streaming",
           "detect_chat_commands"
         ]
       }
     }
   }
   ```

4. **Restart your MCP client** to connect to the Twitch server.

### Available MCP Tools

The server provides these enhanced tools:

#### Chat Interaction Tools
- `send_twitch_message_with_confirmation` - Send messages with optional user confirmation
- `observe_twitch_chat_streaming` - Observe chat with real-time progress updates and resumability
- `detect_chat_commands` - Detect and analyze chat commands with AI-powered responses
- `moderate_chat_with_approval` - Multi-turn moderation workflows with user approval

#### Stream Information Tools  
- `get_stream_info_persistent` - Get stream info with resource links for continuous monitoring
- `get_channel_info_persistent` - Get channel info with durable caching and progress updates
- `get_followers_batch` - Retrieve followers with resumable batch processing
- `monitor_stream_persistent` - Create persistent monitoring that survives server restarts

#### Legacy Tools (Still Available)
- `start_stream_monitoring` - Start real-time stream monitoring
- `create_stream_link` - Create persistent resource links
- `start_chat_recording` - Record chat messages with persistent storage
- `start_chat_analytics` - Process chat analytics

### MCP Resources

The server exposes these resources:
- `twitch://stream/{channel}` - Real-time stream information
- `twitch://chat/{channel}/history` - Chat message history
- `twitch://stream-link/{linkId}` - Persistent stream access links

### Troubleshooting MCP Connection

1. **Check Build**: Ensure `npm run build` completed successfully
2. **Check Environment**: Verify `.env` file has required Twitch credentials  
3. **Check Absolute Path**: Make sure the MCP configuration uses the absolute path to `dist/src/index.js`
4. **Test Connection**: Run `npm run mcp:test` to verify the server starts correctly
5. **Check Logs**: Look for connection errors in the MCP client logs
6. **Test Manually**: Run `npm start` to test the server directly

#### Common Issues

- **"Cannot find module" errors**: Usually indicates incorrect path in MCP configuration or missing build
- **Connection timeout**: Server may not be starting properly - check environment variables
- **Path alias errors**: Ensure project was built after fixing import paths

#### Known Issues

- **Message sending with confirmation**: The `send_twitch_message_with_confirmation` tool may timeout when `requireConfirmation=true` due to elicitation mechanism limitations in current MCP implementation. 
  - **Workaround**: Use `requireConfirmation=false` for now
  - **Status**: Under investigation - related to MCP elicitation/sampling features
- **Chat message sending**: Some OAuth tokens may have limited chat:edit permissions
  - **Workaround**: Ensure token was generated with `chat:edit` scope
  - **Verify**: Check token permissions at token generator site

## Legacy Claude Integration

For direct HTTP API integration (deprecated in favor of MCP):

```json
{
  "tools": [
    {
      "name": "observe_twitch_chat",
      "description": "Observe Twitch chat in a specific channel for a configurable duration",
      "input_schema": {
        "type": "object",
        "properties": {
          "channel": {
            "type": "string",
            "description": "The Twitch channel to observe (without the # prefix)"
          },
          "duration": {
            "type": "integer",
            "description": "Duration to observe in milliseconds (default: 60000 = 1 minute)"
          }
        },
        "required": ["channel"]
      }
    }
  ]
}
```

## Development Status

This project implements the Twitch MCP Enhancements specification with the following completed features:

### ✅ Completed (Tasks 1-5.3.1)
- **Core MCP Infrastructure**: Server setup, protocol compliance, resource management
- **Enhanced Chat Tools**: Multi-turn interactions, streaming progress, elicitation support
- **Stream Information Tools**: Persistent state, durable caching, batch processing
- **Testing & Setup**: Comprehensive test suite, setup scripts, documentation

### 🚧 In Progress  
- **Client Testing Infrastructure**: MCP client testing tools and integration tests
- **User Documentation**: Setup guides and troubleshooting documentation

### 📋 Planned
- **AI-Powered Chat Analysis**: Sentiment analysis, topic detection, user behavior insights
- **Advanced Interactive Features**: Channel Points, polls, predictions with AI assistance
- **Community Management**: Intelligent moderation, automated responses, user engagement tools

See `.kiro/specs/twitch-mcp-enhancements/tasks.md` for detailed implementation progress.

## License

MIT 
