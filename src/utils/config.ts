import dotenv from 'dotenv';

dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  
  metaApi: {
    token: process.env.METAAPI_TOKEN || '',
    accountId: process.env.METAAPI_ACCOUNT_ID || ''
  },
  allowedChannelId: process.env.ALLOWED_CHANNEL_ID || '',
  trading: {
    maxTradeSize: parseFloat(process.env.MAX_TRADE_SIZE || '0.1'),
    riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || '2')
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

export const validateConfig = (): boolean => {
  const required = [
    { name: 'BOT_TOKEN', value: config.botToken },
    { name: 'ALLOWED_CHANNEL_ID', value: config.allowedChannelId },
    { name: 'METAAPI_TOKEN', value: config.metaApi.token },
    { name: 'METAAPI_ACCOUNT_ID', value: config.metaApi.accountId }
  ];
  
  const missing = required.filter(field => !field.value || field.value.length === 0);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(field => {
      console.error(`   - ${field.name}: ${field.value ? 'empty' : 'not set'}`);
    });
    console.error('');
    console.error('💡 Please check your .env file and ensure all required fields are set.');
    console.error('   See .env.example for reference or SETUP_INSTRUCTIONS_FOR_CLIENT.md for help.');
    return false;
  }
  
  console.log('✅ All required environment variables are set');
  return true;
};
