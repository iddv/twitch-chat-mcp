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
echo "🌐 Deployment Configuration:"
read -p "Environment (dev/staging/prod) [dev]: " ENVIRONMENT
ENVIRONMENT=${ENVIRONMENT:-dev}

read -p "AWS Region [us-east-1]: " AWS_REGION
AWS_REGION=${AWS_REGION:-us-east-1}

read -p "Domain name (optional): " DOMAIN_NAME

# Set redirect URI
if [ -n "$DOMAIN_NAME" ]; then
    REDIRECT_URI="https://${DOMAIN_NAME}/auth/callback"
else
    REDIRECT_URI="http://localhost:3000/auth/callback"
fi

echo ""
echo "📝 Configuration Summary:"
echo "========================"
echo "Environment: $ENVIRONMENT"
echo "AWS Region: $AWS_REGION"
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

# AWS Configuration (optional for local development)
AWS_REGION=$AWS_REGION
# KMS_KEY_ID=your-kms-key-id
# CLOUDWATCH_LOG_GROUP=/aws/mcp/twitch-chat-mcp-$ENVIRONMENT
EOF

log_success ".env file created"

# Update Parameter Store if AWS CLI is available
if command -v aws &> /dev/null && aws sts get-caller-identity &> /dev/null; then
    log_info "Updating AWS Parameter Store..."
    
    PROJECT_NAME="twitch-chat-mcp"
    
    # Update parameters
    aws ssm put-parameter \
        --name "/${PROJECT_NAME}/${ENVIRONMENT}/twitch/client-id" \
        --value "$TWITCH_CLIENT_ID" \
        --type "String" \
        --overwrite \
        --region "$AWS_REGION" \
        --description "Twitch OAuth Client ID" || log_warning "Failed to update client ID parameter"
    
    aws ssm put-parameter \
        --name "/${PROJECT_NAME}/${ENVIRONMENT}/twitch/client-secret" \
        --value "$TWITCH_CLIENT_SECRET" \
        --type "SecureString" \
        --overwrite \
        --region "$AWS_REGION" \
        --description "Twitch OAuth Client Secret" || log_warning "Failed to update client secret parameter"
    
    log_success "Parameter Store updated"
else
    log_warning "AWS CLI not configured. Parameter Store not updated."
fi

# Create Docker environment file
log_info "Creating Docker environment file..."
cat > infrastructure/docker/.env << EOF
TWITCH_CLIENT_ID=$TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET=$TWITCH_CLIENT_SECRET
TWITCH_REDIRECT_URI=$REDIRECT_URI
JWT_SECRET=$(openssl rand -hex 32)
AWS_REGION=$AWS_REGION
EOF

log_success "Docker environment file created"

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
echo "   Docker:"
echo "     cd infrastructure/docker && docker-compose up"
echo ""
echo "   AWS Deployment:"
echo "     export KEY_PAIR_NAME=your-ec2-key-pair"
echo "     ./scripts/deploy.sh deploy"
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
