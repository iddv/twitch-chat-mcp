#!/usr/bin/env node

/**
 * MCP Server Startup Script
 * 
 * This script provides an easy way to start the Twitch MCP server with proper
 * configuration validation and error handling.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

// Check if .env file exists
function checkEnvironmentFile() {
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  
  if (!fs.existsSync(envPath)) {
    logWarning('.env file not found');
    
    if (fs.existsSync(envExamplePath)) {
      logInfo('Copying .env.example to .env');
      fs.copyFileSync(envExamplePath, envPath);
      logSuccess('.env file created from .env.example');
      logWarning('Please edit .env file with your Twitch credentials before running the server');
      return false;
    } else {
      logError('.env.example file not found. Cannot create .env file.');
      return false;
    }
  }
  
  return true;
}

// Load and validate environment variables
function validateEnvironment() {
  require('dotenv').config();
  
  const requiredVars = ['TWITCH_CLIENT_ID'];
  const optionalVars = ['TWITCH_USERNAME', 'TWITCH_OAUTH_TOKEN', 'TWITCH_CHANNELS'];
  
  let hasRequired = true;
  let hasOptional = false;
  
  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      logError(`Missing required environment variable: ${varName}`);
      hasRequired = false;
    }
  }
  
  // Check optional variables (at least one should be present for functionality)
  for (const varName of optionalVars) {
    if (process.env[varName]) {
      hasOptional = true;
      break;
    }
  }
  
  if (!hasRequired) {
    logError('Missing required environment variables. Please check your .env file.');
    return false;
  }
  
  if (!hasOptional) {
    logWarning('No optional Twitch configuration found. Server will start but Twitch integration will be limited.');
    logInfo('Consider setting TWITCH_OAUTH_TOKEN or TWITCH_CHANNELS for full functionality.');
  }
  
  return true;
}

// Check if the project is built
function checkBuild() {
  const distPath = path.join(process.cwd(), 'dist');
  const mainFile = path.join(distPath, 'src', 'index.js');
  
  if (!fs.existsSync(mainFile)) {
    logWarning('Project not built. Building now...');
    
    try {
      const { execSync } = require('child_process');
      execSync('npm run build', { stdio: 'inherit' });
      logSuccess('Project built successfully');
      return true;
    } catch (error) {
      logError('Failed to build project');
      logError(error.message);
      return false;
    }
  }
  
  return true;
}

// Start the MCP server
function startServer() {
  logInfo('Starting Twitch MCP Server...');
  
  const serverProcess = spawn('node', ['dist/src/index.js'], {
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  serverProcess.on('error', (error) => {
    logError(`Failed to start server: ${error.message}`);
    process.exit(1);
  });
  
  serverProcess.on('exit', (code) => {
    if (code === 0) {
      logSuccess('Server stopped gracefully');
    } else {
      logError(`Server exited with code ${code}`);
    }
    process.exit(code);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logInfo('Received SIGINT, shutting down gracefully...');
    serverProcess.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    logInfo('Received SIGTERM, shutting down gracefully...');
    serverProcess.kill('SIGTERM');
  });
}

// Main execution
function main() {
  log(`${colors.bright}${colors.cyan}🎮 Twitch MCP Server Startup${colors.reset}`);
  log('');
  
  // Step 1: Check environment file
  if (!checkEnvironmentFile()) {
    process.exit(1);
  }
  
  // Step 2: Validate environment variables
  if (!validateEnvironment()) {
    process.exit(1);
  }
  
  // Step 3: Check build
  if (!checkBuild()) {
    process.exit(1);
  }
  
  // Step 4: Start server
  logSuccess('All checks passed. Starting server...');
  log('');
  startServer();
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };