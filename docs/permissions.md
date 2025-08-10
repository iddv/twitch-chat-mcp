# Permission System Documentation

## Overview

The Twitch MCP Server implements a comprehensive permission system that automatically filters available tools based on the configured permission level and required Twitch OAuth scopes. This prevents awkward situations where tools are available but lack the necessary permissions to function.

## Permission Levels

### 🎯 VIEWER
- **Description**: Read-only access to public stream information
- **Required Scopes**: None
- **Use Case**: Monitoring streams, getting public information
- **Available Tools**: 8 tools
  - Stream monitoring and information tools
  - Authentication tools

### 🤖 CHATBOT  
- **Description**: Chat interaction capabilities - read and send messages
- **Required Scopes**: `chat:read`, `chat:edit`
- **Use Case**: Interactive chat bots, automated responses
- **Available Tools**: 15 tools
  - All viewer tools
  - Chat observation and interaction
  - Command detection
  - Chat recording and analytics

### 🛡️ MODERATOR
- **Description**: Moderation capabilities - manage chat, timeout users, delete messages
- **Required Scopes**: `chat:read`, `chat:edit`, `channel:moderate`, `moderator:manage:chat_messages`
- **Use Case**: Channel moderation, automated moderation workflows
- **Available Tools**: 16 tools
  - All chatbot tools
  - Moderation workflows with approval

### 👑 ADMIN
- **Description**: Full access - all tools and advanced features
- **Required Scopes**: `chat:read`, `chat:edit`, `channel:moderate`, `moderator:manage:chat_messages`, `channel:read:subscriptions`, `user:read:follows`
- **Use Case**: Full channel management, analytics, community management
- **Available Tools**: 17 tools
  - All moderator tools
  - Follower batch processing
  - Advanced analytics

## Configuration

### Environment Variable
Set the permission level in your `.env` file or MCP configuration:

```bash
TWITCH_PERMISSION_LEVEL=chatbot  # viewer, chatbot, moderator, admin
```

### MCP Configuration
Include the permission level in your MCP server configuration:

```json
{
  "mcpServers": {
    "twitch-mcp": {
      "command": "node",
      "args": ["/path/to/dist/src/index.js"],
      "env": {
        "TWITCH_CLIENT_ID": "your_client_id",
        "TWITCH_OAUTH_TOKEN": "oauth:your_token",
        "TWITCH_PERMISSION_LEVEL": "chatbot"
      }
    }
  }
}
```

## Token Generation

Generate tokens with the correct scopes for your permission level:

### Viewer (No scopes needed)
- Visit: `https://twitchtokengenerator.com/quick/YOUR_CLIENT_ID`
- No additional scopes required

### Chatbot
- Visit: `https://twitchtokengenerator.com/quick/YOUR_CLIENT_ID`
- Required scopes: `chat:read+chat:edit`

### Moderator  
- Visit: `https://twitchtokengenerator.com/quick/YOUR_CLIENT_ID`
- Required scopes: `chat:read+chat:edit+channel:moderate+moderator:manage:chat_messages`

### Admin
- Visit: `https://twitchtokengenerator.com/quick/YOUR_CLIENT_ID`
- Required scopes: `chat:read+chat:edit+channel:moderate+moderator:manage:chat_messages+channel:read:subscriptions+user:read:follows`

## Utility Commands

### Check Current Configuration
```bash
npm run permissions
```
Shows current permission level, required scopes, and available tools.

### Test Permission System
```bash
npm run test:permissions
```
Tests all permission levels to ensure proper tool filtering.

## Implementation Details

### Tool Filtering
- Tools are filtered at the MCP protocol level during `ListToolsRequest`
- Unauthorized tool execution attempts return clear error messages
- Permission checks happen before tool execution

### Error Handling
When a tool is called without proper permissions:
```
Tool 'moderate_chat_with_approval' is not available for permission level 'chatbot'. 
Required level: moderator. 
Current scopes: [chat:read, chat:edit]
```

### Logging
The server logs permission-related information:
- Permission level loaded at startup
- Number of tools filtered
- Tool access attempts and denials

## Security Benefits

1. **Principle of Least Privilege**: Users only get tools they can actually use
2. **Clear Error Messages**: No confusion about why tools don't work
3. **Scope Validation**: Ensures OAuth tokens have required permissions
4. **Automatic Filtering**: No manual tool management required

## Migration Guide

### From Unfiltered to Permission-Based

1. **Assess Current Usage**: Determine what tools you actually use
2. **Choose Permission Level**: Select the minimum level that provides needed tools
3. **Update Configuration**: Add `TWITCH_PERMISSION_LEVEL` to your config
4. **Regenerate Token**: Ensure your OAuth token has required scopes
5. **Test**: Use `npm run permissions` to verify configuration

### Upgrading Permission Levels

To upgrade from a lower permission level:

1. **Generate New Token**: Get token with additional required scopes
2. **Update Configuration**: Change `TWITCH_PERMISSION_LEVEL`
3. **Restart Server**: Restart MCP server to load new permissions
4. **Verify**: Check that new tools are available

## Troubleshooting

### Common Issues

**Tools Missing After Update**
- Check permission level in configuration
- Verify OAuth token has required scopes
- Run `npm run permissions` to see current status

**Permission Denied Errors**
- Token may not have required scopes
- Permission level may be too low
- Regenerate token with correct scopes

**Configuration Not Applied**
- Restart MCP server after configuration changes
- Check environment variable spelling
- Verify MCP client picked up new configuration

### Debug Commands

```bash
# Check current permission configuration
npm run permissions

# Test all permission levels
npm run test:permissions

# Test MCP connection with current permissions
npm run mcp:test
```