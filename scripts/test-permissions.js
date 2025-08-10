#!/usr/bin/env node

/**
 * Test script to verify permission-based tool filtering works correctly
 */

const { spawn } = require('child_process');
const path = require('path');

async function testPermissionLevel(level) {
  console.log(`\n🧪 Testing permission level: ${level.toUpperCase()}`);
  
  return new Promise((resolve, reject) => {
    const env = { ...process.env, TWITCH_PERMISSION_LEVEL: level };
    const serverPath = path.join(__dirname, '..', 'dist', 'src', 'index.js');
    
    const server = spawn('node', [serverPath], { 
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    server.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    server.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Give server time to start and log tool information
    setTimeout(() => {
      server.kill('SIGTERM');
      
      // Look for permission-related log messages
      const lines = output.split('\n');
      const permissionLines = lines.filter(line => 
        line.includes('Loading tools for permission level') ||
        line.includes('Filtered tools for permission level')
      );
      
      if (permissionLines.length > 0) {
        console.log(`   ✅ Server started with ${level} permissions`);
        permissionLines.forEach(line => {
          const match = line.match(/toolCount: (\d+)|allowedTools: (\d+)/);
          if (match) {
            const count = match[1] || match[2];
            console.log(`   📊 Tools available: ${count}`);
          }
        });
      } else {
        console.log(`   ⚠️  No permission logs found for ${level}`);
      }
      
      if (errorOutput && !errorOutput.includes('SIGTERM')) {
        console.log(`   ❌ Errors: ${errorOutput.trim()}`);
      }
      
      resolve();
    }, 3000);
    
    server.on('error', (error) => {
      console.log(`   ❌ Failed to start server: ${error.message}`);
      resolve();
    });
  });
}

async function runTests() {
  console.log('🔐 Testing Twitch MCP Permission System\n');
  
  const levels = ['viewer', 'chatbot', 'moderator', 'admin'];
  
  for (const level of levels) {
    await testPermissionLevel(level);
  }
  
  console.log('\n✅ Permission testing complete!');
  console.log('\n💡 To manually test:');
  console.log('   1. Set TWITCH_PERMISSION_LEVEL in .env');
  console.log('   2. Run: npm run mcp:test');
  console.log('   3. Check that only expected tools are available');
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testPermissionLevel, runTests };