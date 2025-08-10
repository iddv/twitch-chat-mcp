# Secure Architecture Implementation Plan

## 🎯 **Simplified Approach**
- **OAuth 2.0**: Twitch authorization code grant flow
- **AWS KMS**: Credential encryption (cost-effective)
- **JWT Sessions**: Short-lived, stateless sessions
- **CloudWatch Logs**: Simple logging (no custom metrics)
- **Skip**: Pen testing, custom metrics, complex monitoring

## 📋 **Implementation Steps**

### **Step 4A: OAuth 2.0 Integration**
Replace query parameter credentials with secure OAuth flow.

#### **Files to Create:**
- `src/auth/oauthFlow.ts` - Twitch OAuth 2.0 implementation
- `src/auth/oauthRoutes.ts` - OAuth callback endpoints
- `src/types/oauth.ts` - OAuth type definitions

#### **Implementation:**
```typescript
// OAuth Flow
1. User visits: /auth/twitch
2. Redirect to: https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=...
3. Twitch redirects to: /auth/callback?code=...&state=...
4. Server exchanges code for tokens
5. Store encrypted tokens in database
6. Return JWT session token
```

### **Step 4B: AWS KMS Encryption**
Secure credential storage with AWS KMS.

#### **Files to Create:**
- `src/encryption/kmsService.ts` - KMS encryption/decryption
- `src/storage/credentialStore.ts` - Encrypted credential storage

#### **Implementation:**
```typescript
// KMS Integration
1. Create KMS key in AWS
2. Use AWS Encryption SDK for Node.js
3. Encrypt tokens before database storage
4. Decrypt only when needed for API calls
```

### **Step 4C: JWT Session Management**
Replace in-memory sessions with JWT tokens.

#### **Files to Create:**
- `src/auth/jwtService.ts` - JWT creation/validation
- `src/middleware/authMiddleware.ts` - JWT validation middleware

#### **Implementation:**
```typescript
// JWT Sessions
1. Generate JWT after successful OAuth
2. Include: userId, sessionId, permissions, expiry
3. Validate JWT on each request
4. No credentials in JWT (only references)
```

### **Step 4D: CloudWatch Logging**
Simple structured logging to CloudWatch.

#### **Files to Modify:**
- `src/utils/logger.ts` - Add CloudWatch transport

#### **Implementation:**
```typescript
// CloudWatch Logs
1. Use winston-cloudwatch transport
2. Log: auth events, tool calls, errors
3. Structure: JSON format with userId hash
4. No sensitive data in logs
```

## 🗂️ **Database Schema**

### **Users Table**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  twitch_user_id VARCHAR(50) UNIQUE,
  username VARCHAR(100),
  permission_level VARCHAR(20),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### **Encrypted Credentials Table**
```sql
CREATE TABLE user_credentials (
  user_id UUID REFERENCES users(id),
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  token_expires_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## 💰 **Cost Estimate**
- **KMS**: ~$1/month (1000 requests)
- **CloudWatch Logs**: ~$0.50/GB ingested
- **Database**: Depends on hosting choice
- **Total**: ~$5-10/month for moderate usage

## 🔄 **Migration Strategy**

### **Phase 1: OAuth Implementation**
1. Add OAuth routes alongside existing query param method
2. Test OAuth flow thoroughly
3. Keep backward compatibility

### **Phase 2: Credential Storage**
1. Set up KMS key and encryption service
2. Migrate existing sessions to encrypted storage
3. Update tool handlers to use encrypted credentials

### **Phase 3: JWT Sessions**
1. Implement JWT service
2. Add JWT validation middleware
3. Replace session-based auth with JWT

### **Phase 4: Cleanup**
1. Remove query parameter credential support
2. Remove in-memory session storage
3. Update documentation

## 🛠️ **Environment Variables**

```bash
# OAuth Configuration
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_REDIRECT_URI=https://your-domain.com/auth/callback

# AWS Configuration
AWS_REGION=us-east-1
KMS_KEY_ID=arn:aws:kms:us-east-1:account:key/key-id
CLOUDWATCH_LOG_GROUP=/aws/mcp/twitch-chat

# JWT Configuration
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=30m

# Database
DATABASE_URL=your-database-connection-string
```

## 🎯 **Success Criteria**

### **Step 4A Complete:**
- ✅ OAuth flow redirects to Twitch
- ✅ Authorization code exchange works
- ✅ Tokens stored securely
- ✅ JWT returned to client

### **Step 4B Complete:**
- ✅ KMS encryption/decryption working
- ✅ Credentials encrypted in database
- ✅ No plain text credentials anywhere

### **Step 4C Complete:**
- ✅ JWT validation on all requests
- ✅ Session isolation working
- ✅ Tools use per-user credentials

### **Step 4D Complete:**
- ✅ Structured logs in CloudWatch
- ✅ Auth events logged
- ✅ No sensitive data in logs

## 📝 **Next Actions**

1. **Start with Step 4A**: OAuth 2.0 integration
2. **Set up AWS KMS**: Create encryption key
3. **Choose database**: SQLite for dev, PostgreSQL for prod
4. **Test incrementally**: Each step should be testable

---

**Estimated Timeline**: 2-3 days for core implementation
**Priority**: Security first, then functionality
**Approach**: Incremental implementation with testing at each step
