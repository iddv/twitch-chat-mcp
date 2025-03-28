# Twitch Chat MCP Server

A Message Control Protocol (MCP) server that connects Claude desktop with Twitch chat, allowing Claude to read and interact with Twitch chat.

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

## Claude Integration

To use this server with Claude, configure Claude to use the following tool definition:

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
    },
    {
      "name": "send_twitch_message",
      "description": "Send a message to a Twitch channel",
      "input_schema": {
        "type": "object",
        "properties": {
          "channel": {
            "type": "string",
            "description": "The Twitch channel to send a message to (without the # prefix)"
          },
          "message": {
            "type": "string",
            "description": "The message to send to the channel"
          }
        },
        "required": ["channel", "message"]
      }
    }
  ]
}
```

## License

MIT 