# 🚀 Twitch Chat MCP Server - Deployment Guide

This guide covers all deployment options for the Twitch Chat MCP Server with enterprise-grade security.

## 📋 Prerequisites

### Required
- AWS CLI configured with appropriate permissions
- Node.js 18+ (for local development)
- Docker (for containerized deployment)
- Twitch Developer Application (Client ID & Secret)

### AWS Permissions Required
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "ec2:*",
        "iam:*",
        "kms:*",
        "ssm:*",
        "logs:*",
        "elasticloadbalancing:*",
        "autoscaling:*"
      ],
      "Resource": "*"
    }
  ]
}
```

## 🔧 Setup Steps

### 1. Get Twitch OAuth Credentials

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console)
2. Create a new application
3. Set OAuth Redirect URL to: `https://your-domain.com/auth/callback`
4. Note down your **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
# Required for all deployments
export TWITCH_CLIENT_ID="your_client_id_here"
export TWITCH_CLIENT_SECRET="your_client_secret_here"

# AWS Configuration
export AWS_REGION="us-east-1"
export ENVIRONMENT="dev"  # or staging, prod

# For EC2 deployment
export KEY_PAIR_NAME="your-ec2-key-pair"
export DOMAIN_NAME="your-domain.com"  # optional
```

## 🚀 Deployment Options

### Option 1: AWS CloudFormation (Recommended for Production)

#### Quick Deploy
```bash
# Clone repository
git clone <your-repo-url>
cd twitch-chat-mcp

# Deploy everything
./scripts/deploy.sh deploy
```

#### Step-by-Step Deploy
```bash
# 1. Deploy core infrastructure (KMS, IAM, CloudWatch)
./scripts/deploy.sh deploy

# 2. Check deployment status
./scripts/deploy.sh info

# 3. Test deployment
./scripts/deploy.sh test
```

#### What Gets Deployed
- **KMS Key** for credential encryption
- **CloudWatch Log Group** for application logs
- **IAM Roles** with least-privilege permissions
- **Parameter Store** for secure configuration
- **EC2 Auto Scaling Group** with Load Balancer
- **Security Groups** with minimal required access

### Option 2: Docker (Local Development)

```bash
# Build and run with Docker Compose
cd infrastructure/docker
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f twitch-chat-mcp

# Access application
curl http://localhost:3000/health
```

### Option 3: Local Development

```bash
# Install dependencies
npm install

# Build application
npm run build

# Set environment variables
export JWT_SECRET="dev-secret-change-in-production"
export TWITCH_CLIENT_ID="your_client_id"
export TWITCH_CLIENT_SECRET="your_client_secret"
export TWITCH_REDIRECT_URI="http://localhost:3000/auth/callback"

# Start server
npm start
```

## 🔒 Security Configuration

### KMS Encryption
The deployment automatically creates a KMS key for encrypting Twitch credentials. The key policy allows only the MCP server role to use it.

### Parameter Store
Sensitive configuration is stored in AWS Systems Manager Parameter Store:
- `/twitch-chat-mcp/dev/twitch/client-id` (String)
- `/twitch-chat-mcp/dev/twitch/client-secret` (SecureString)
- `/twitch-chat-mcp/dev/jwt/secret` (SecureString)

### IAM Roles
The server runs with minimal IAM permissions:
- KMS encrypt/decrypt for the specific key only
- CloudWatch Logs write access
- Parameter Store read access for configuration

## 🌐 OAuth Configuration

### Redirect URLs
Configure these in your Twitch Developer Application:
- **Production**: `https://your-domain.com/auth/callback`
- **Development**: `http://localhost:3000/auth/callback`

### Permission Levels
The server supports 4 permission levels:
- **viewer**: Read-only stream information
- **chatbot**: Chat read/write capabilities
- **moderator**: Moderation tools
- **admin**: Full access to all features

## 📊 Monitoring & Logging

### CloudWatch Logs
All application logs are sent to CloudWatch:
- Log Group: `/aws/mcp/twitch-chat-mcp-{environment}`
- Structured JSON logging
- Security events tracked
- No sensitive data logged

### Health Checks
- **Endpoint**: `/health`
- **Load Balancer**: Automatic health checks
- **Docker**: Built-in health check

### Metrics Available
```bash
# Check server status
curl https://your-domain.com/health

# OAuth configuration status
curl https://your-domain.com/auth/status
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `TWITCH_CLIENT_ID` | Yes | Twitch OAuth Client ID | - |
| `TWITCH_CLIENT_SECRET` | Yes | Twitch OAuth Client Secret | - |
| `JWT_SECRET` | Yes | JWT signing secret | - |
| `TWITCH_REDIRECT_URI` | Yes | OAuth redirect URL | - |
| `KMS_KEY_ID` | No | AWS KMS Key ID | Uses memory fallback |
| `AWS_REGION` | No | AWS region | us-east-1 |
| `PORT` | No | Server port | 3000 |
| `MCP_TRANSPORT` | No | Transport type | http |

### CloudFormation Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `Environment` | Environment name | dev |
| `ProjectName` | Project name | twitch-chat-mcp |
| `InstanceType` | EC2 instance type | t3.micro |
| `KeyPairName` | EC2 key pair | Required |
| `DomainName` | Domain name | Optional |

## 🧪 Testing

### Automated Tests
```bash
# Run deployment tests
./scripts/deploy.sh test

# Manual health check
curl https://your-domain.com/health | jq .

# Test OAuth flow
curl https://your-domain.com/auth/status | jq .
```

### OAuth Flow Test
1. Visit: `https://your-domain.com/auth/twitch?permission_level=chatbot`
2. Authorize with Twitch
3. Receive JWT token
4. Test authenticated endpoint: `curl -H "Authorization: Bearer YOUR_JWT" https://your-domain.com/auth/me`

## 🔄 Updates & Maintenance

### Update Application
```bash
# Pull latest code
git pull origin main

# Rebuild and deploy
npm run build
./scripts/deploy.sh deploy
```

### Rotate Secrets
```bash
# Update Twitch credentials
aws ssm put-parameter --name "/twitch-chat-mcp/prod/twitch/client-secret" --value "new_secret" --type "SecureString" --overwrite

# Restart application (Auto Scaling Group will handle this)
aws autoscaling start-instance-refresh --auto-scaling-group-name "twitch-chat-mcp-prod-asg"
```

### Scale Application
```bash
# Update Auto Scaling Group
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name "twitch-chat-mcp-prod-asg" \
  --desired-capacity 3
```

## 🧹 Cleanup

### Delete All Resources
```bash
# Delete everything
./scripts/deploy.sh cleanup

# Verify deletion
aws cloudformation list-stacks --stack-status-filter DELETE_COMPLETE
```

### Manual Cleanup
```bash
# Delete deployment stack
aws cloudformation delete-stack --stack-name twitch-chat-mcp-dev-deployment

# Delete core stack
aws cloudformation delete-stack --stack-name twitch-chat-mcp-dev-core
```

## 🚨 Troubleshooting

### Common Issues

#### 1. KMS Key Access Denied
```bash
# Check IAM role permissions
aws iam get-role-policy --role-name twitch-chat-mcp-dev-server-role --policy-name KMSAccess
```

#### 2. OAuth Redirect Mismatch
- Ensure redirect URI in Twitch app matches deployment URL
- Check `TWITCH_REDIRECT_URI` environment variable

#### 3. Health Check Failures
```bash
# Check application logs
aws logs tail /aws/mcp/twitch-chat-mcp-dev --follow

# Check EC2 instance status
aws ec2 describe-instances --filters "Name=tag:Project,Values=twitch-chat-mcp"
```

#### 4. Parameter Store Access
```bash
# Test parameter access
aws ssm get-parameter --name "/twitch-chat-mcp/dev/twitch/client-id"
```

## 💰 Cost Estimation

### AWS Resources (Monthly)
- **t3.micro EC2**: ~$8.50
- **Application Load Balancer**: ~$16.20
- **KMS Key**: ~$1.00
- **CloudWatch Logs**: ~$0.50 (1GB)
- **Parameter Store**: Free tier
- **Data Transfer**: ~$1.00

**Total**: ~$27/month for development environment

### Production Optimizations
- Use Reserved Instances for 40% savings
- Enable CloudWatch Logs retention policies
- Use Spot Instances for non-critical environments

## 🔐 Security Best Practices

### Implemented
- ✅ OAuth 2.0 authorization code grant
- ✅ KMS encryption for credentials
- ✅ JWT session management
- ✅ IAM least-privilege access
- ✅ Security Groups with minimal access
- ✅ Parameter Store for secrets
- ✅ Audit logging
- ✅ No credentials in code/logs

### Additional Recommendations
- Enable AWS CloudTrail for API auditing
- Set up AWS Config for compliance monitoring
- Use AWS WAF for additional protection
- Enable VPC Flow Logs
- Set up AWS GuardDuty for threat detection

## 📞 Support

### Logs Location
- **CloudWatch**: `/aws/mcp/twitch-chat-mcp-{environment}`
- **EC2**: `/var/log/messages`
- **Application**: Structured JSON logs

### Monitoring Endpoints
- **Health**: `https://your-domain.com/health`
- **OAuth Status**: `https://your-domain.com/auth/status`
- **Metrics**: Available in CloudWatch

This deployment provides enterprise-grade security and scalability for the Twitch Chat MCP Server! 🚀
