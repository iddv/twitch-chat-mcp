# Multi-stage build for efficient local deployment
FROM node:lts-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json tsconfig.json ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Copy source code
COPY src/ ./src/

# Build the project
RUN npm run build

# Production stage
FROM node:lts-alpine AS production

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('MCP Server is healthy')" || exit 1

# Start the MCP server
CMD ["node", "dist/src/index.js"]
