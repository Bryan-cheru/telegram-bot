#!/usr/bin/env node
/**
 * Render.com Environment Variables Generator
 * Extracts .env variables for easy copy-paste into Render dashboard
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔧 RENDER.COM ENVIRONMENT VARIABLES SETUP');
console.log('═'.repeat(60));

console.log('\n📋 COPY THESE VARIABLES TO RENDER.COM DASHBOARD:');
console.log('   Dashboard → Service → Environment → Add Environment Variable');
console.log('═'.repeat(60));

const envPath = path.join(__dirname, '../.env');

if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');

let count = 0;

lines.forEach(line => {
  const trimmed = line.trim();
  
  // Skip comments and empty lines
  if (trimmed === '' || trimmed.startsWith('#')) {
    return;
  }
  
  // Parse key=value
  const equalIndex = trimmed.indexOf('=');
  if (equalIndex === -1) {
    return;
  }
  
  const key = trimmed.substring(0, equalIndex);
  const value = trimmed.substring(equalIndex + 1);
  
  // Skip if empty value
  if (!value.trim()) {
    return;
  }
  
  count++;
  console.log(`\n${count}. Variable: ${key}`);
  console.log(`   Value: ${value}`);
});

console.log('\n═'.repeat(60));
console.log(`📊 Total Variables: ${count}`);
console.log('\n🎯 CRITICAL VARIABLES FOR RENDER:');
console.log('   ✅ BOT_TOKEN - Your Telegram bot token');
console.log('   ✅ ALLOWED_CHANNEL_ID - Your Telegram channel ID');
console.log('   ✅ METAAPI_TOKEN - Your MetaAPI authentication token');
console.log('   ✅ METAAPI_ACCOUNTS - Your MetaAPI account configuration');
console.log('   ✅ MONGODB_URI - Your MongoDB connection string');
console.log('   ✅ JWT_SECRET - Secure JWT secret for authentication');
console.log('   ✅ NODE_ENV - Set to "production"');

console.log('\n📝 RENDER.COM SETUP STEPS:');
console.log('   1. Go to Render.com dashboard');
console.log('   2. Click on your service');
console.log('   3. Go to "Environment" tab');
console.log('   4. Click "Add Environment Variable"');
console.log('   5. Copy each key-value pair from above');
console.log('   6. Save and redeploy');

console.log('\n🚨 SECURITY NOTE:');
console.log('   Never commit sensitive tokens to git!');
console.log('   Use Render\'s environment variables for all secrets.');

console.log('\n═'.repeat(60));