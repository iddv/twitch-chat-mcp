# Twitch Chat MCP Server
[![smithery badge](https://smithery.ai/badge/@iddv/twitch-chat-mcp)](https://smithery.ai/server/@iddv/twitch-chat-mcp)

A Model Context Protocol (MCP) server that connects MCP Clients, like Claude Desktop, Amazon Q CLI or Stands agent with Twitch chat, allowing the agent to interact with Twitch chat.

## ✨ Key Features

- **🔐 Permission-Based Access** - 4 permission levels (viewer, chatbot, moderator, admin) with automatic tool filtering
- **💬 Real-time Chat Monitoring** - Read live chat messages with AI-powered analysis
- **📊 Stream Information** - Get live viewer counts, game titles, and stream status
- **🤖 Command Detection** - Automatically detect and respond to chat commands
- **💾 Persistent Sessions** - Resume monitoring across server restarts
- **🔑 OAuth Authentication** - Secure Twitch API integration with scope validation
- **🔌 MCP Compliant** - Full protocol support for Claude Desktop and Kiro

## Available Tools

### 🎮 Stream Information & Monitoring
 - `start_stream_monitoring` - Start real-time monitoring of a Twitch stream with automatic updates
 - `stop_stream_monitoring` - Stop real-time monitoring of a Twitch stream
 - `get_stream_info_persistent` - Get stream information with resource links for continuous monitoring
 - `get_channel_info_persistent` - Get channel information with durable caching and progress updates
 - `create_stream_link` - Create a persistent resource link for long-term stream access
 - `monitor_stream_persisten`t - Create persistent monitoring tools that survive server restarts
 - `get_monitoring_status` - Get the current status of all stream monitoring sessions

### 💬 Chat Interaction & Analysis
 - `observe_twitch_chat_streaming` - Observe Twitch chat with real-time progress streaming and resumability
 - `send_twitch_message_with_confirmation` - Send a message to Twitch chat with user confirmation via elicitation
 - `detect_chat_commands` - Detect and analyze chat commands with AI-powered response generation
 - `start_chat_recording` - Start recording chat messages for a channel with persistent storage
 - `stop_chat_recording` - Stop recording chat messages for a channel
 - `create_chat_history_link` - Create a persistent link for chat history with analytics
 - `start_chat_analytics` - Start processing chat analytics for a channel and timeframe

### 👥 Community & Moderation
 - `moderate_chat_with_approval` - Multi-turn moderation workflow with user approval for actions
 - `get_followers_batch` - Retrieve followers with resumable batch processing

### 🔐 Authentication & Setup
 - `authenticate_twitch` - Start Twitch OAuth authentication flow to enable full API access

## 🚀 Status

**✅ MCP Server Fully Operational**: Successfully tested with live Twitch integration!

**✅ Verified Features**:
- ✅ **Real-time Stream Data**: Live stream info, viewer counts, game titles
- ✅ **Chat Reading**: Successfully reading live chat messages from active streams  
- ✅ **Command Detection**: AI-powered chat command monitoring and analysis
- ✅ **Session Management**: Persistent state, resume tokens, resource links
- ✅ **MCP Integration**: Full protocol compliance with Kiro/Claude Desktop
- ✅ **OAuth Authentication**: One-time manual setup working perfectly

**Quick Start**: Follow the setup guide below to get your own Twitch token!

## 🚀 Quick Setup for MCP

### Installing via Smithery (Local Only)

To install twitch-chat-mcp for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@iddv/twitch-chat-mcp):

```bash
npx -y @smithery/cli install @iddv/twitch-chat-mcp --client claude
```

### 🐳 Local Docker Deployment (Recommended)

The easiest way to run Twitch Chat MCP locally with full isolation and easy management:

#### Quick Start
```bash
# 1. Clone and setup
git clone <your-repo-url>
cd twitch-chat-mcp

# 2. Run the automated setup script
npm run docker:setup
```

The setup script will:
- Check Docker installation
- Create `.env` file from template
- Guide you through getting Twitch credentials
- Build and start the Docker container
- Provide connection instructions for your MCP client

#### Manual Docker Setup
```bash
# 1. Get Twitch credentials (see below)
# 2. Create .env file with your credentials
cp .env.example .env
# Edit .env with your Twitch Client ID and OAuth Token

# 3. Build and run
npm run docker:build
npm run docker:run

# View logs
npm run docker:logs

# Stop container
npm run docker:stop
```

#### Docker Management Commands
```bash
npm run docker:setup   # Automated setup script
npm run docker:build   # Build Docker image
npm run docker:run     # Start container
npm run docker:stop    # Stop container
npm run docker:logs    # View logs
npm run docker:clean   # Stop and remove image
```

### 1. Get Twitch Credentials
1. **Log into Twitch on your browser**: `https://www.twitch.tv`
2. **Get OAuth Token**:
   - Visit: `https://twitchtokengenerator.com/`
   - Select `Bot Chat Token`
   - Authorize Twitch
   - Copy `Client ID` and replace `your_client_id_here` below
   - Copy `Access Token` and replace `TWITCH_OAUTH_TOKEN` below

### 2. Choose Permission Level & Configure MCP

**Check Available Permission Levels**:
```bash
npm run permissions  # See all levels and required scopes
```

**Configure MCP Server** in `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "twitch-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/twitch-chat-mcp/dist/src/index.js"],
      "env": {
        "TWITCH_CLIENT_ID": "your_client_id_here",
        "TWITCH_OAUTH_TOKEN": "oauth:your_token_here",
        "TWITCH_PERMISSION_LEVEL": "chatbot"
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

**Permission Levels**:
- `viewer` - Read-only stream info (no scopes needed)
- `chatbot` - Chat interaction (requires: `chat:read+chat:edit`)
- `moderator` - Moderation tools (requires: `chat:read+chat:edit+channel:moderate+moderator:manage:chat_messages`)
- `admin` - Full access (requires: all above + `channel:read:subscriptions+user:read:follows`)

## Contribution

### 1. Build and Test

```bash
npm run build
npm run mcp:test
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