#!/usr/bin/env node

/**
 * Environment Setup Script
 * 
 * This script helps set up the environment for the Twitch MCP server
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
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

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Check if .env file exists and create if needed
async function setupEnvironmentFile() {
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  
  if (fs.existsSync(envPath)) {
    logInfo('.env file already exists');
    const overwrite = await askQuestion('Do you want to reconfigure it? (y/N): ');
    if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
      return false;
    }
  }
  
  if (!fs.existsSync(envExamplePath)) {
    logError('.env.example file not found');
    return false;
  }
  
  // Read the example file
  const exampleContent = fs.readFileSync(envExamplePath, 'utf8');
  let envContent = exampleContent;
  
  log(`${colors.cyan}🔧 Twitch MCP Server Configuration${colors.reset}`);
  log('');
  logInfo('Please provide your Twitch application credentials.');
  logInfo('You can get these from: https://dev.twitch.tv/console/apps');
  log('');
  
  // Ask for Twitch Client ID
  const clientId = await askQuestion('Enter your Twitch Client ID: ');
  if (clientId) {
    envContent = envContent.replace('TWITCH_CLIENT_ID=your_client_id', `TWITCH_CLIENT_ID=${clientId}`);
  }
  
  // Ask for optional OAuth token
  log('');
  logInfo('OAuth Token is optional. If not provided, you can authenticate via browser.');
  const oauthToken = await askQuestion('Enter your Twitch OAuth Token (optional): ');
  if (oauthToken) {
    const formattedToken = oauthToken.startsWith('oauth:') ? oauthToken : `oauth:${oauthToken}`;
    envContent = envContent.replace('TWITCH_OAUTH_TOKEN=oauth:your_oauth_token', `TWITCH_OAUTH_TOKEN=${formattedToken}`);
  }
  
  // Ask for username
  const username = await askQuestion('Enter your Twitch username (optional): ');
  if (username) {
    envContent = envContent.replace('TWITCH_USERNAME=your_bot_username', `TWITCH_USERNAME=${username}`);
  }
  
  // Ask for channels
  log('');
  logInfo('Enter channels to monitor (comma-separated, optional):');
  const channels = await askQuestion('Channels: ');
  if (channels) {
    envContent = envContent.replace('TWITCH_CHANNELS=channel1,channel2', `TWITCH_CHANNELS=${channels}`);
  }
  
  // Ask for log level
  log('');
  logInfo('Choose log level (debug, info, warn, error):');
  const logLevel = await askQuestion('Log level [info]: ') || 'info';
  envContent = envContent.replace('LOG_LEVEL=info', `LOG_LEVEL=${logLevel}`);
  
  // Write the .env file
  fs.writeFileSync(envPath, envContent);
  logSuccess('.env file created successfully');
  
  return true;
}

// Validate the current environment
function validateEnvironment() {
  require('dotenv').config();
  
  logInfo('Validating environment configuration...');
  
  const checks = [
    {
      name: 'TWITCH_CLIENT_ID',
      required: true,
      value: process.env.TWITCH_CLIENT_ID
    },
    {
      name: 'TWITCH_OAUTH_TOKEN',
      required: false,
      value: process.env.TWITCH_OAUTH_TOKEN
    },
    {
      name: 'TWITCH_USERNAME',
      required: false,
      value: process.env.TWITCH_USERNAME
    },
    {
      name: 'TWITCH_CHANNELS',
      required: false,
      value: process.env.TWITCH_CHANNELS
    }
  ];
  
  let allGood = true;
  
  for (const check of checks) {
    if (check.required && !check.value) {
      logError(`Missing required variable: ${check.name}`);
      allGood = false;
    } else if (check.value) {
      logSuccess(`${check.name}: configured`);
    } else {
      logWarning(`${check.name}: not configured (optional)`);
    }
  }
  
  return allGood;
}

// Main setup function
async function main() {
  log(`${colors.cyan}🎮 Twitch MCP Server Setup${colors.reset}`);
  log('');
  
  try {
    // Step 1: Setup environment file
    const envSetup = await setupEnvironmentFile();
    
    if (envSetup) {
      log('');
      logInfo('Environment file created. Validating configuration...');
      log('');
    }
    
    // Step 2: Validate environment
    const isValid = validateEnvironment();
    
    log('');
    if (isValid) {
      logSuccess('Environment setup complete!');
      logInfo('You can now start the MCP server with: npm run start:mcp');
    } else {
      logError('Environment setup incomplete. Please check the errors above.');
    }
    
  } catch (error) {
    logError(`Setup failed: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };