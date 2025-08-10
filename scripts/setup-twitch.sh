#!/bin/bash

# Twitch OAuth Setup Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🔧 Twitch OAuth Setup for MCP Server"
echo "===================================="
echo ""

# Check if running in interactive mode
if [ ! -t 0 ]; then
    log_error "This script must be run interactively"
    exit 1
fi

# Get Twitch credentials
echo "📋 Please provide your Twitch OAuth credentials:"
echo "   (Get them from: https://dev.twitch.tv/console)"
echo ""

read -p "Twitch Client ID: " TWITCH_CLIENT_ID
if [ -z "$TWITCH_CLIENT_ID" ]; then
    log_error "Client ID is required"
    exit 1
fi

read -s -p "Twitch Client Secret: " TWITCH_CLIENT_SECRET
echo ""
if [ -z "$TWITCH_CLIENT_SECRET" ]; then
    log_error "Client Secret is required"
    exit 1
fi

# Get deployment configuration
echo ""
echo "🌐 Configuration:"
read -p "Domain name (leave blank for localhost): " DOMAIN_NAME

# Set redirect URI
if [ -n "$DOMAIN_NAME" ]; then
    REDIRECT_URI="https://${DOMAIN_NAME}/auth/callback"
else
    REDIRECT_URI="http://localhost:3000/auth/callback"
fi

echo ""
echo "📝 Configuration Summary:"
echo "========================"
echo "Client ID: ${TWITCH_CLIENT_ID:0:8}..."
echo "Redirect URI: $REDIRECT_URI"
echo ""

read -p "Continue with this configuration? (y/N): " CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    log_info "Setup cancelled"
    exit 0
fi

# Create .env file for local development
log_info "Creating .env file for local development..."
cat > .env << EOF
# Twitch OAuth Configuration
TWITCH_CLIENT_ID=$TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET=$TWITCH_CLIENT_SECRET
TWITCH_REDIRECT_URI=$REDIRECT_URI

# JWT Configuration
JWT_SECRET=$(openssl rand -hex 32)

# Server Configuration
PORT=3000
MCP_TRANSPORT=http
NODE_ENV=development
EOF

log_success ".env file created"

# Set up Twitch Developer Application
echo ""
echo "🔗 Next Steps:"
echo "=============="
echo ""
echo "1. Configure your Twitch Developer Application:"
echo "   - Go to: https://dev.twitch.tv/console"
echo "   - Edit your application"
echo "   - Set OAuth Redirect URL to: $REDIRECT_URI"
echo ""
echo "2. Test your setup:"
echo "   Local development:"
echo "     npm install && npm run build && npm start"
echo "     Visit: http://localhost:3000/health"
echo ""
echo "3. OAuth Flow Test:"
echo "   Visit: $REDIRECT_URI/../auth/twitch?permission_level=chatbot"
echo ""

log_success "Setup complete! 🎉"

# Show security reminders
echo ""
echo "🔒 Security Reminders:"
echo "====================="
echo "- Never commit .env files to version control"
echo "- Rotate secrets regularly in production"
echo "- Use different credentials for each environment"
echo "- Monitor OAuth usage in Twitch Developer Console"
echo ""

# Create .gitignore entry if it doesn't exist
if ! grep -q "^\.env$" .gitignore 2>/dev/null; then
    echo ".env" >> .gitignore
    log_info "Added .env to .gitignore"
fi
