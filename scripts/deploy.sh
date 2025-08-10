#!/bin/bash

# Twitch Chat MCP Server Deployment Script
set -e

# Configuration
PROJECT_NAME="twitch-chat-mcp"
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
CORE_STACK_NAME="${PROJECT_NAME}-${ENVIRONMENT}-core"
DEPLOYMENT_STACK_NAME="${PROJECT_NAME}-${ENVIRONMENT}-deployment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Please run 'aws configure'."
        exit 1
    fi
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        log_warning "jq is not installed. Some features may not work properly."
    fi
    
    log_success "Prerequisites check passed"
}

# Deploy core infrastructure
deploy_core_infrastructure() {
    log_info "Deploying core infrastructure..."
    
    aws cloudformation deploy \
        --template-file infrastructure/cloudformation/core-infrastructure.yaml \
        --stack-name "$CORE_STACK_NAME" \
        --parameter-overrides \
            Environment="$ENVIRONMENT" \
            ProjectName="$PROJECT_NAME" \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "$AWS_REGION" \
        --tags \
            Environment="$ENVIRONMENT" \
            Project="$PROJECT_NAME" \
            ManagedBy="CloudFormation"
    
    if [ $? -eq 0 ]; then
        log_success "Core infrastructure deployed successfully"
    else
        log_error "Failed to deploy core infrastructure"
        exit 1
    fi
}

# Update Twitch credentials
update_twitch_credentials() {
    log_info "Updating Twitch OAuth credentials..."
    
    if [ -z "$TWITCH_CLIENT_ID" ] || [ -z "$TWITCH_CLIENT_SECRET" ]; then
        log_warning "TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET environment variables not set"
        log_info "Please update them manually in Parameter Store:"
        log_info "  /${PROJECT_NAME}/${ENVIRONMENT}/twitch/client-id"
        log_info "  /${PROJECT_NAME}/${ENVIRONMENT}/twitch/client-secret"
        return
    fi
    
    # Update Twitch Client ID
    aws ssm put-parameter \
        --name "/${PROJECT_NAME}/${ENVIRONMENT}/twitch/client-id" \
        --value "$TWITCH_CLIENT_ID" \
        --type "String" \
        --overwrite \
        --region "$AWS_REGION"
    
    # Update Twitch Client Secret
    aws ssm put-parameter \
        --name "/${PROJECT_NAME}/${ENVIRONMENT}/twitch/client-secret" \
        --value "$TWITCH_CLIENT_SECRET" \
        --type "SecureString" \
        --overwrite \
        --region "$AWS_REGION"
    
    log_success "Twitch credentials updated in Parameter Store"
}

# Deploy EC2 infrastructure
deploy_ec2_infrastructure() {
    log_info "Deploying EC2 infrastructure..."
    
    # Check if key pair exists
    if [ -z "$KEY_PAIR_NAME" ]; then
        log_error "KEY_PAIR_NAME environment variable is required for EC2 deployment"
        log_info "Create a key pair first: aws ec2 create-key-pair --key-name my-key-pair"
        exit 1
    fi
    
    aws cloudformation deploy \
        --template-file infrastructure/cloudformation/ec2-deployment.yaml \
        --stack-name "$DEPLOYMENT_STACK_NAME" \
        --parameter-overrides \
            Environment="$ENVIRONMENT" \
            ProjectName="$PROJECT_NAME" \
            CoreStackName="$CORE_STACK_NAME" \
            KeyPairName="$KEY_PAIR_NAME" \
            DomainName="${DOMAIN_NAME:-}" \
            InstanceType="${INSTANCE_TYPE:-t3.micro}" \
        --capabilities CAPABILITY_IAM \
        --region "$AWS_REGION" \
        --tags \
            Environment="$ENVIRONMENT" \
            Project="$PROJECT_NAME" \
            ManagedBy="CloudFormation"
    
    if [ $? -eq 0 ]; then
        log_success "EC2 infrastructure deployed successfully"
    else
        log_error "Failed to deploy EC2 infrastructure"
        exit 1
    fi
}

# Get deployment outputs
get_deployment_info() {
    log_info "Getting deployment information..."
    
    # Get Load Balancer URL
    LB_URL=$(aws cloudformation describe-stacks \
        --stack-name "$DEPLOYMENT_STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerURL`].OutputValue' \
        --output text 2>/dev/null || echo "Not deployed")
    
    # Get KMS Key ID
    KMS_KEY_ID=$(aws cloudformation describe-stacks \
        --stack-name "$CORE_STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`KMSKeyId`].OutputValue' \
        --output text 2>/dev/null || echo "Not found")
    
    echo ""
    echo "🚀 Deployment Information:"
    echo "=========================="
    echo "Environment: $ENVIRONMENT"
    echo "Region: $AWS_REGION"
    echo "Core Stack: $CORE_STACK_NAME"
    echo "Deployment Stack: $DEPLOYMENT_STACK_NAME"
    echo "Load Balancer URL: $LB_URL"
    echo "KMS Key ID: $KMS_KEY_ID"
    echo ""
    
    if [ "$LB_URL" != "Not deployed" ]; then
        echo "🔗 OAuth Endpoints:"
        echo "  Start OAuth: $LB_URL/auth/twitch"
        echo "  Health Check: $LB_URL/health"
        echo "  OAuth Status: $LB_URL/auth/status"
        echo ""
    fi
    
    echo "📋 Parameter Store Paths:"
    echo "  Twitch Client ID: /${PROJECT_NAME}/${ENVIRONMENT}/twitch/client-id"
    echo "  Twitch Client Secret: /${PROJECT_NAME}/${ENVIRONMENT}/twitch/client-secret"
    echo "  JWT Secret: /${PROJECT_NAME}/${ENVIRONMENT}/jwt/secret"
    echo ""
}

# Test deployment
test_deployment() {
    if [ "$LB_URL" = "Not deployed" ]; then
        log_warning "Deployment not found, skipping tests"
        return
    fi
    
    log_info "Testing deployment..."
    
    # Test health endpoint
    if curl -s "$LB_URL/health" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        log_success "Health check passed"
    else
        log_warning "Health check failed or server not ready yet"
    fi
    
    # Test OAuth status
    if curl -s "$LB_URL/auth/status" | jq -e '.availableScopes' > /dev/null 2>&1; then
        log_success "OAuth endpoints accessible"
    else
        log_warning "OAuth endpoints not accessible"
    fi
}

# Cleanup function
cleanup_deployment() {
    log_info "Cleaning up deployment..."
    
    # Delete deployment stack
    aws cloudformation delete-stack \
        --stack-name "$DEPLOYMENT_STACK_NAME" \
        --region "$AWS_REGION" 2>/dev/null || true
    
    # Delete core stack
    aws cloudformation delete-stack \
        --stack-name "$CORE_STACK_NAME" \
        --region "$AWS_REGION" 2>/dev/null || true
    
    log_success "Cleanup initiated (stacks will be deleted asynchronously)"
}

# Main deployment function
main() {
    echo "🚀 Twitch Chat MCP Server Deployment"
    echo "===================================="
    echo ""
    
    case "${1:-deploy}" in
        "deploy")
            check_prerequisites
            deploy_core_infrastructure
            update_twitch_credentials
            
            if [ "${DEPLOY_EC2:-true}" = "true" ]; then
                deploy_ec2_infrastructure
            else
                log_info "Skipping EC2 deployment (DEPLOY_EC2=false)"
            fi
            
            get_deployment_info
            
            if [ "${RUN_TESTS:-true}" = "true" ]; then
                sleep 30  # Wait for deployment to be ready
                test_deployment
            fi
            ;;
        "info")
            get_deployment_info
            ;;
        "test")
            get_deployment_info
            test_deployment
            ;;
        "cleanup")
            cleanup_deployment
            ;;
        *)
            echo "Usage: $0 [deploy|info|test|cleanup]"
            echo ""
            echo "Commands:"
            echo "  deploy   - Deploy infrastructure and application"
            echo "  info     - Show deployment information"
            echo "  test     - Test the deployment"
            echo "  cleanup  - Delete all resources"
            echo ""
            echo "Environment Variables:"
            echo "  ENVIRONMENT         - Deployment environment (dev/staging/prod)"
            echo "  AWS_REGION          - AWS region (default: us-east-1)"
            echo "  TWITCH_CLIENT_ID    - Twitch OAuth Client ID"
            echo "  TWITCH_CLIENT_SECRET - Twitch OAuth Client Secret"
            echo "  KEY_PAIR_NAME       - EC2 Key Pair name (required for EC2)"
            echo "  DOMAIN_NAME         - Domain name for OAuth redirect"
            echo "  INSTANCE_TYPE       - EC2 instance type (default: t3.micro)"
            echo "  DEPLOY_EC2          - Deploy EC2 infrastructure (default: true)"
            echo "  RUN_TESTS           - Run deployment tests (default: true)"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
