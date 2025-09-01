import dotenv from 'dotenv';
import path from 'path';

// Only load dotenv if environment variables aren't already set (e.g., in Electron)
if (!process.env.BOT_TOKEN && !process.env.ELECTRON_IS_RUNNING) {
  // For standalone Node.js execution
  dotenv.config();
} else if (process.env.ELECTRON_IS_RUNNING && !process.env.BOT_TOKEN) {
  // For Electron execution, try to load from the correct path
  const envPath = path.join(process.cwd(), '.env');
  dotenv.config({ path: envPath });
}

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  
  metaApi: {
    token: process.env.METAAPI_TOKEN || '',
    accountId: process.env.METAAPI_ACCOUNT_ID || ''
  },
  allowedChannelId: process.env.ALLOWED_CHANNEL_ID || '',
  trading: {
    maxTradeSize: parseFloat(process.env.MAX_TRADE_SIZE || '0.1'),
    riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || '2'),
    enforceOneToOneRR: process.env.ENFORCE_1_1_RR !== 'false', // Default to true unless explicitly disabled
    defaultOrderType: process.env.DEFAULT_ORDER_TYPE || 'MARKET', // MARKET, LIMIT, or AUTO
    useSmartOrderType: process.env.USE_SMART_ORDER_TYPE !== 'false', // Auto-detect best order type
    limitOrderSlippage: parseFloat(process.env.LIMIT_ORDER_SLIPPAGE || '5'), // Pips from entry zone
    pendingOrderExpiration: parseInt(process.env.PENDING_ORDER_EXPIRATION || '4'), // Hours
    enableAdvancedOrderTypes: process.env.ENABLE_ADVANCED_ORDER_TYPES !== 'false'
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

// Additional debug function
export const debugConfig = (): void => {
  console.log('🔍 Configuration Debug:');
  console.log(`   BOT_TOKEN: ${config.botToken ? 'SET (' + config.botToken.substring(0, 10) + '...)' : 'NOT SET'}`);
  console.log(`   ALLOWED_CHANNEL_ID: ${config.allowedChannelId || 'NOT SET'}`);
  console.log(`   METAAPI_TOKEN: ${config.metaApi.token ? 'SET (' + config.metaApi.token.substring(0, 10) + '...)' : 'NOT SET'}`);
  console.log(`   METAAPI_ACCOUNT_ID: ${config.metaApi.accountId || 'NOT SET'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
  console.log(`   ELECTRON_IS_RUNNING: ${process.env.ELECTRON_IS_RUNNING || 'NOT SET'}`);
};
