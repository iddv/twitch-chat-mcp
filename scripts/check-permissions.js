#!/usr/bin/env node

/**
 * Permission checker utility for Twitch MCP Server
 * Helps users understand permission levels and required scopes
 */

const { PERMISSION_CONFIGS, getPermissionLevel, getCurrentPermissionConfig } = require('../dist/src/types/permissions');

function displayPermissionInfo() {
  console.log('🔐 Twitch MCP Server - Permission Levels\n');
  
  // Show all available permission levels
  console.log('📋 Available Permission Levels:\n');
  
  Object.values(PERMISSION_CONFIGS).forEach(config => {
    console.log(`🎯 ${config.level.toUpperCase()}`);
    console.log(`   Description: ${config.description}`);
    console.log(`   Required Scopes: ${config.requiredScopes.length > 0 ? config.requiredScopes.join(', ') : 'None'}`);
    console.log(`   Available Tools: ${config.allowedTools.length}`);
    console.log('');
  });
  
  // Show current configuration
  console.log('⚙️  Current Configuration:\n');
  const currentConfig = getCurrentPermissionConfig();
  const currentLevel = getPermissionLevel();
  
  console.log(`   Permission Level: ${currentLevel.toUpperCase()}`);
  console.log(`   Description: ${currentConfig.description}`);
  console.log(`   Required Scopes: ${currentConfig.requiredScopes.length > 0 ? currentConfig.requiredScopes.join(', ') : 'None'}`);
  console.log(`   Available Tools: ${currentConfig.allowedTools.length}`);
  console.log('');
  
  // Show tool breakdown
  console.log('🛠️  Tool Breakdown by Permission Level:\n');
  
  const toolsByLevel = {};
  Object.values(PERMISSION_CONFIGS).forEach(config => {
    toolsByLevel[config.level] = config.allowedTools;
  });
  
  // Show unique tools for each level
  const viewerTools = toolsByLevel.viewer;
  const chatbotOnlyTools = toolsByLevel.chatbot.filter(t => !viewerTools.includes(t));
  const moderatorOnlyTools = toolsByLevel.moderator.filter(t => !toolsByLevel.chatbot.includes(t));
  const adminOnlyTools = toolsByLevel.admin.filter(t => !toolsByLevel.moderator.includes(t));
  
  console.log(`   👁️  VIEWER (${viewerTools.length} tools):`);
  viewerTools.forEach(tool => console.log(`      • ${tool}`));
  console.log('');
  
  console.log(`   🤖 CHATBOT adds (${chatbotOnlyTools.length} tools):`);
  chatbotOnlyTools.forEach(tool => console.log(`      • ${tool}`));
  console.log('');
  
  console.log(`   🛡️  MODERATOR adds (${moderatorOnlyTools.length} tools):`);
  moderatorOnlyTools.forEach(tool => console.log(`      • ${tool}`));
  console.log('');
  
  console.log(`   👑 ADMIN adds (${adminOnlyTools.length} tools):`);
  adminOnlyTools.forEach(tool => console.log(`      • ${tool}`));
  console.log('');
  
  // Show configuration instructions
  console.log('⚡ Quick Setup:\n');
  console.log('   1. Set your permission level in .env:');
  console.log('      TWITCH_PERMISSION_LEVEL=chatbot  # or viewer, moderator, admin');
  console.log('');
  console.log('   2. Generate token with required scopes:');
  console.log(`      https://twitchtokengenerator.com/quick/YOUR_CLIENT_ID`);
  console.log(`      Required scopes for ${currentLevel}: ${currentConfig.requiredScopes.join('+') || 'none'}`);
  console.log('');
  console.log('   3. Add token to .env or MCP config:');
  console.log('      TWITCH_OAUTH_TOKEN=oauth:your_token_here');
  console.log('');
}

// Run if called directly
if (require.main === module) {
  try {
    displayPermissionInfo();
  } catch (error) {
    console.error('❌ Error checking permissions:', error.message);
    console.log('\n💡 Make sure to run "npm run build" first to compile TypeScript files.');
    process.exit(1);
  }
}

module.exports = { displayPermissionInfo };