#!/usr/bin/env node

/**
 * Test MCP Connection Script
 * 
 * This script tests the MCP server connection and basic functionality
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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

// Test if the server can start
async function testServerStart() {
  return new Promise((resolve, reject) => {
    logInfo('Testing MCP server startup...');
    
    // Check if built files exist
    const indexPath = path.join(process.cwd(), 'dist', 'src', 'index.js');
    if (!fs.existsSync(indexPath)) {
      logError(`Built file not found: ${indexPath}`);
      logInfo('Run "npm run build" first');
      reject(new Error('Built files not found'));
      return;
    }
    
    // Start the server process
    const serverProcess = spawn('node', ['dist/src/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'debug'
      }
    });
    
    let output = '';
    let errorOutput = '';
    
    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    
    serverProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      process.stderr.write(data);
    });
    
    serverProcess.on('error', (error) => {
      logError(`Failed to start server process: ${error.message}`);
      reject(error);
    });
    
    // Give the server 5 seconds to start
    setTimeout(() => {
      if (serverProcess.pid && !serverProcess.killed) {
        logSuccess('Server started successfully');
        
        // Kill the server
        serverProcess.kill('SIGTERM');
        
        setTimeout(() => {
          if (!serverProcess.killed) {
            serverProcess.kill('SIGKILL');
          }
          resolve(true);
        }, 1000);
      } else {
        logError('Server failed to start within 5 seconds');
        reject(new Error('Server startup timeout'));
      }
    }, 5000);
    
    serverProcess.on('exit', (code, signal) => {
      if (signal === 'SIGTERM') {
        logSuccess('Server shut down gracefully');
      } else if (code !== 0) {
        logError(`Server exited with code ${code}`);
        if (errorOutput) {
          logError('Error output:');
          console.error(errorOutput);
        }
      }
    });
  });
}

// Test MCP protocol communication
async function testMCPProtocol() {
  return new Promise((resolve, reject) => {
    logInfo('Testing MCP protocol communication...');
    
    const serverProcess = spawn('node', ['dist/src/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error' // Reduce noise
      }
    });
    
    let responseReceived = false;
    
    serverProcess.stdout.on('data', (data) => {
      try {
        const lines = data.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          if (line.trim()) {
            const message = JSON.parse(line);
            if (message.jsonrpc === '2.0') {
              logSuccess('Received valid MCP message');
              responseReceived = true;
            }
          }
        }
      } catch (error) {
        // Not JSON, might be log output
      }
    });
    
    serverProcess.on('error', (error) => {
      logError(`Server process error: ${error.message}`);
      reject(error);
    });
    
    // Send initialize request
    setTimeout(() => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: {
              listChanged: true
            },
            sampling: {}
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      };
      
      logInfo('Sending initialize request...');
      serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
      
      // Wait for response
      setTimeout(() => {
        if (responseReceived) {
          logSuccess('MCP protocol communication successful');
          serverProcess.kill('SIGTERM');
          resolve(true);
        } else {
          logError('No MCP response received');
          serverProcess.kill('SIGKILL');
          reject(new Error('No MCP response'));
        }
      }, 3000);
    }, 1000);
  });
}

// Main test function
async function main() {
  log(`${colors.cyan}🧪 Testing Twitch MCP Server${colors.reset}`);
  log('');
  
  try {
    // Test 1: Server startup
    await testServerStart();
    log('');
    
    // Test 2: MCP protocol
    await testMCPProtocol();
    log('');
    
    logSuccess('All tests passed! MCP server is working correctly.');
    
  } catch (error) {
    logError(`Test failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };