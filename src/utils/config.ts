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
    accountId: process.env.METAAPI_ACCOUNT_ID || '', // Legacy single account support
    accounts: process.env.METAAPI_ACCOUNTS || '' // New multi-account support
  },
  allowedChannelId: process.env.ALLOWED_CHANNEL_ID || '',
  allowedChannelUsername: process.env.ALLOWED_CHANNEL_USERNAME || '', // e.g., 'tradingchannel' (without @)
  trading: {
    maxTradeSize: parseFloat(process.env.MAX_TRADE_SIZE || '0.1'),
    riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || '1.3'),
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
  console.log('🔍 CRITICAL: Validating configuration for production safety...');
  
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required configuration
  const required = [
    { name: 'BOT_TOKEN', value: config.botToken },
    { name: 'ALLOWED_CHANNEL_ID', value: config.allowedChannelId },
    { name: 'METAAPI_TOKEN', value: config.metaApi.token }
  ];

  // Check required fields
  const missing = required.filter(field => !field.value || field.value.length === 0);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(field => {
      console.error(`   - ${field.name}: ${field.value ? 'empty' : 'not set'}`);
      errors.push(`${field.name} is required`);
    });
  }

  // Either single account or multi-account configuration must be provided
  const hasAccountConfig = config.metaApi.accountId || config.metaApi.accounts;
  if (!hasAccountConfig) {
    errors.push('CRITICAL: No MetaAPI account configuration found. Set METAAPI_ACCOUNT_ID or METAAPI_ACCOUNTS');
    console.error('❌ No MetaAPI account configuration found');
  }

  // Validate multi-account format if provided
  if (config.metaApi.accounts) {
    const accountStrings = config.metaApi.accounts.split(',');
    accountStrings.forEach((accountStr, index) => {
      const parts = accountStr.trim().split(':');
      if (parts.length !== 3) {
        errors.push(`CRITICAL: Invalid account format at index ${index}: "${accountStr}". Expected format: "accountId:brokerName:accountType"`);
        console.error(`❌ Invalid account format: ${accountStr}`);
      } else {
        const [id, broker, type] = parts;
        if (!id.trim() || !broker.trim() || !type.trim()) {
          errors.push(`CRITICAL: Empty values in account config: "${accountStr}"`);
        }
        if (!['DEMO', 'LIVE'].includes(type.trim().toUpperCase())) {
          warnings.push(`WARNING: Account type "${type}" should be DEMO or LIVE`);
          console.warn(`⚠️ Account type "${type}" should be DEMO or LIVE`);
        }
      }
    });
  }

  // Validate trading parameters
  if (config.trading.maxTradeSize <= 0 || config.trading.maxTradeSize > 100) {
    warnings.push('WARNING: MAX_TRADE_SIZE should be between 0.01 and 100');
    console.warn('⚠️ MAX_TRADE_SIZE seems unusual:', config.trading.maxTradeSize);
  }

  if (config.trading.riskPercentage <= 0 || config.trading.riskPercentage > 10) {
    warnings.push('WARNING: RISK_PERCENTAGE should be between 0.1 and 10');
    console.warn('⚠️ RISK_PERCENTAGE seems unusual:', config.trading.riskPercentage);
  }

  // Validate Telegram Channel ID format
  if (config.allowedChannelId && !config.allowedChannelId.startsWith('-')) {
    warnings.push('WARNING: ALLOWED_CHANNEL_ID should start with "-" for channel IDs');
    console.warn('⚠️ Channel ID format may be incorrect:', config.allowedChannelId);
  }

  // Critical security checks
  if (config.metaApi.token.length < 50) {
    errors.push('CRITICAL: METAAPI_TOKEN appears too short - verify it\'s the complete token');
    console.error('❌ MetaAPI token seems incomplete');
  }

  if (config.botToken.length < 40) {
    errors.push('CRITICAL: BOT_TOKEN appears too short - verify it\'s the complete token');
    console.error('❌ Bot token seems incomplete');
  }

  // Display results
  if (errors.length > 0) {
    console.error('\n🚨 CONFIGURATION ERRORS FOUND:');
    errors.forEach(error => console.error(`   ${error}`));
    console.error('\n💡 Please check your .env file and ensure all required fields are set correctly.');
    console.error('   See SETUP.md for configuration instructions.');
    return false;
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  CONFIGURATION WARNINGS:');
    warnings.forEach(warning => console.warn(`   ${warning}`));
  }

  console.log('✅ Configuration validation passed');
  return true;
};

// Additional debug function
export const debugConfig = (): void => {
  console.log('🔍 Configuration Debug:');
  console.log(`   BOT_TOKEN: ${config.botToken ? 'SET (' + config.botToken.substring(0, 10) + '...)' : 'NOT SET'}`);
  console.log(`   ALLOWED_CHANNEL_ID: ${config.allowedChannelId || 'NOT SET'}`);
  console.log(`   METAAPI_TOKEN: ${config.metaApi.token ? 'SET (' + config.metaApi.token.substring(0, 10) + '...)' : 'NOT SET'}`);
  
  // Show both single and multi-account configurations
  if (config.metaApi.accounts) {
    console.log(`   METAAPI_ACCOUNTS: SET (${config.metaApi.accounts.split(',').length} accounts configured)`);
  } else {
    console.log(`   METAAPI_ACCOUNTS: NOT SET`);
  }
  
  if (config.metaApi.accountId) {
    console.log(`   METAAPI_ACCOUNT_ID: SET (${config.metaApi.accountId.substring(0, 8)}...)`);
  } else {
    console.log(`   METAAPI_ACCOUNT_ID: NOT SET`);
  }
  
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
  console.log(`   ELECTRON_IS_RUNNING: ${process.env.ELECTRON_IS_RUNNING || 'NOT SET'}`);
};
