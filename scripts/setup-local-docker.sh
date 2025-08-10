#!/bin/bash

# Twitch Chat MCP - Local Docker Setup Script
# This script helps you set up the MCP server locally using Docker

set -e

echo "🚀 Twitch Chat MCP - Local Docker Setup"
echo "======================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env file from .env.example"
        echo "⚠️  Please edit .env file with your Twitch credentials before continuing."
        echo ""
        echo "To get your credentials:"
        echo "1. Visit: https://twitchtokengenerator.com/"
        echo "2. Select 'Bot Chat Token'"
        echo "3. Authorize with Twitch"
        echo "4. Copy Client ID and Access Token to .env file"
        echo ""
        read -p "Press Enter after updating .env file..."
    else
        echo "❌ No .env.example file found. Please create .env file manually."
        exit 1
    fi
fi

# Source the .env file to check if credentials are set
source .env

if [ -z "$TWITCH_CLIENT_ID" ] || [ -z "$TWITCH_OAUTH_TOKEN" ]; then
    echo "❌ TWITCH_CLIENT_ID and TWITCH_OAUTH_TOKEN must be set in .env file"
    exit 1
fi

echo "✅ Environment variables configured"

# Build the Docker image
echo "🔨 Building Docker image..."
docker build -t twitch-chat-mcp .

echo "✅ Docker image built successfully"

# Create necessary directories
mkdir -p logs data

echo "📁 Created logs and data directories"

# Start the container
echo "🚀 Starting Twitch Chat MCP container..."

# Use docker-compose if available, otherwise use docker run
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d
    else
        docker compose up -d
    fi
    echo "✅ Container started with Docker Compose"
    echo "📊 View logs: docker-compose logs -f twitch-chat-mcp"
    echo "🛑 Stop container: docker-compose down"
else
    docker run -d \
        --name twitch-chat-mcp \
        --restart unless-stopped \
        -e TWITCH_CLIENT_ID="$TWITCH_CLIENT_ID" \
        -e TWITCH_OAUTH_TOKEN="$TWITCH_OAUTH_TOKEN" \
        -e TWITCH_PERMISSION_LEVEL="${TWITCH_PERMISSION_LEVEL:-viewer}" \
        -v "$(pwd)/logs:/app/logs" \
        -v "$(pwd)/data:/app/data" \
        twitch-chat-mcp
    
    echo "✅ Container started with Docker"
    echo "📊 View logs: docker logs -f twitch-chat-mcp"
    echo "🛑 Stop container: docker stop twitch-chat-mcp && docker rm twitch-chat-mcp"
fi

echo ""
echo "🎉 Twitch Chat MCP is now running locally!"
echo ""
echo "Next steps:"
echo "1. The MCP server is running in the background"
echo "2. Configure your MCP client (Claude Desktop, Amazon Q, etc.) to connect"
echo "3. Use the connection details from your client's documentation"
echo ""
echo "For Claude Desktop, add this to your claude_desktop_config.json:"
echo '{'
echo '  "mcpServers": {'
echo '    "twitch-chat-mcp": {'
echo '      "command": "node",'
echo '      "args": ["'$(pwd)'/dist/src/index.js"],'
echo '      "env": {'
echo '        "TWITCH_CLIENT_ID": "'$TWITCH_CLIENT_ID'",'
echo '        "TWITCH_OAUTH_TOKEN": "'$TWITCH_OAUTH_TOKEN'",'
echo '        "TWITCH_PERMISSION_LEVEL": "'${TWITCH_PERMISSION_LEVEL:-viewer}'"'
echo '      }'
echo '    }'
echo '  }'
echo '}'
