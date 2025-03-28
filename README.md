# Twitch Chat MCP Server

A Message Control Protocol (MCP) server that connects Claude desktop with Twitch chat, allowing Claude to read and interact with Twitch chat.

## Features

- Connect with Claude desktop via HTTP API
- Authenticate with Twitch API
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
- `llm/` - LLM-related files
  - `seed_prompt.md` - Original development prompt

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the example environment file and fill in your Twitch credentials:
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` with your Twitch username and OAuth token.

3. Build the project:
   ```bash
   npm run build
   ```

4. Start the server:
   ```bash
   npm start
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