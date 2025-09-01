#!/usr/bin/env node

/**
 * DEPLOYMENT DEBUG: Check which MetaAPI Account ID is being used
 */

require('dotenv').config();

console.log('🔍 DEPLOYMENT ENVIRONMENT DEBUG');
console.log('================================');

console.log('\n📊 LOCAL .ENV FILE:');
console.log(`   METAAPI_ACCOUNT_ID: ${process.env.METAAPI_ACCOUNT_ID}`);
console.log(`   BOT_TOKEN: ${process.env.BOT_TOKEN ? process.env.BOT_TOKEN.substring(0, 15) + '...' : 'NOT SET'}`);
console.log(`   ALLOWED_CHANNEL_ID: ${process.env.ALLOWED_CHANNEL_ID}`);

console.log('\n🏷️  ACCOUNT IDENTIFICATION:');
console.log('============================');

const accounts = {
    'f29bf66f-1cee-46df-9980-8eb68d7a336c': '🟢 FTMO-DEMO (Active in .env)',
    '060723c1-a97d-4bc0-b2fe-a74110959569': '🔴 PEPPERSTONE-LIVE (Commented)',
    '891582ec-3b09-474b-8b75-9909f0652818': '🟡 PEPPERSTONE-DEMO (Commented)'
};

const currentId = process.env.METAAPI_ACCOUNT_ID;
const accountType = accounts[currentId] || '❓ UNKNOWN ACCOUNT';

console.log(`   Current ID: ${currentId}`);
console.log(`   Account Type: ${accountType}`);

console.log('\n🚨 RENDER DEPLOYMENT ISSUES:');
console.log('=============================');
console.log('If Render is using wrong account:');
console.log('1. 🔄 Clear Render environment variables cache');
console.log('2. 📝 Re-set METAAPI_ACCOUNT_ID in Render dashboard');
console.log('3. 🚀 Re-deploy the service');
console.log('4. 📊 Check logs to confirm new ID is being used');

console.log('\n✅ CORRECT SETUP FOR RENDER:');
console.log('==============================');
console.log('In Render Environment Variables:');
console.log(`   METAAPI_ACCOUNT_ID = ${currentId}`);
console.log(`   BOT_TOKEN = ${process.env.BOT_TOKEN}`);
console.log(`   ALLOWED_CHANNEL_ID = ${process.env.ALLOWED_CHANNEL_ID}`);

console.log('\n🔧 DEBUGGING STEPS:');
console.log('====================');
console.log('1. Check Render dashboard environment variables');
console.log('2. Ensure they match your local .env');
console.log('3. Restart the Render service');
console.log('4. Check deployment logs for confirmation');

process.exit(0);
