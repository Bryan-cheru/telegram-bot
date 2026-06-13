import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Only load dotenv if environment variables aren't already set (e.g., in Electron)
if (!process.env.BOT_TOKEN && !process.env.ELECTRON_IS_RUNNING) {
  // For standalone Node.js execution
  dotenv.config();
} else if (process.env.ELECTRON_IS_RUNNING && !process.env.BOT_TOKEN) {
  // For Electron execution, try to load from the correct path
  const envPath = path.join(process.cwd(), '.env');
  dotenv.config({ path: envPath });
}

/** Merge data/settings.json over process.env before building config (persisted dashboard settings). */
function mergePersistedSettingsFile(): void {
  try {
    const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
    if (!fs.existsSync(settingsPath)) return;
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === undefined) continue;
      process.env[k] = String(v);
    }
    console.log(`📂 Merged persisted settings from ${settingsPath}`);
  } catch (e) {
    console.warn('⚠️ Could not load data/settings.json:', e);
  }
}

mergePersistedSettingsFile();

/**
 * Persist a single runtime setting to data/settings.json so it survives restarts.
 * Also applies it immediately to process.env and re-syncs the in-memory config.
 */
export function persistSetting(key: string, value: string): void {
  process.env[key] = value;

  const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(settingsPath)) {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch { /* start fresh if file is corrupt */ }

  existing[key] = value;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
}


export const config = {
  botToken: process.env.BOT_TOKEN || '',
  
  // Application configuration
  nodeEnv: process.env.NODE_ENV || 'development',
  instanceType: process.env.INSTANCE_TYPE || 'production',
  botEnabled: process.env.BOT_ENABLED !== 'false', // Default to true unless explicitly disabled
  dashboardEnabled: process.env.DASHBOARD_ENABLED !== 'false', // Default to true unless explicitly disabled
  dashboardPort: parseInt(process.env.DASHBOARD_PORT || '3000'),
  
  metaApi: {
    token: process.env.METAAPI_TOKEN || '', // Optional - users can configure their own accounts
    accountId: process.env.METAAPI_ACCOUNT_ID || '', // Legacy single account support
    accounts: process.env.METAAPI_ACCOUNTS || process.env.METAAPI_TEST_ACCOUNT || '' // Multi-account or test account support
  },
  allowedChannelId: process.env.ALLOWED_CHANNEL_ID || '',
  allowedChannelUsername: process.env.ALLOWED_CHANNEL_USERNAME || '',
  // Chat ID to send trade notifications to (defaults to the signal channel)
  notificationChatId: process.env.NOTIFICATION_CHAT_ID || process.env.ALLOWED_CHANNEL_ID || '',
  trading: {
    fixedLotSize: parseFloat(process.env.FIXED_LOT_SIZE || '0.45'),
    cryptoLotSize: parseFloat(process.env.CRYPTO_LOT_SIZE || '0.05'),
    maxTradeSize: parseFloat(process.env.MAX_TRADE_SIZE || '1.0'),   // raised — set per account size
    riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || '1.3'),
    fixedRiskAmount: parseFloat(process.env.FIXED_RISK_AMOUNT || '50'), // $50 default — set to 1-2% of balance
    enforceOneToOneRR: process.env.ENFORCE_1_1_RR !== 'false',
    defaultOrderType: process.env.DEFAULT_ORDER_TYPE || 'MARKET',
    useSmartOrderType: process.env.USE_SMART_ORDER_TYPE !== 'false',
    limitOrderSlippage: parseFloat(process.env.LIMIT_ORDER_SLIPPAGE || '5'),
    pendingOrderExpiration: parseInt(process.env.PENDING_ORDER_EXPIRATION || '4'),
    enableAdvancedOrderTypes: process.env.ENABLE_ADVANCED_ORDER_TYPES !== 'false'
  },
  limits: {
    maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '5'),
    dailyLossLimit: parseFloat(process.env.DAILY_LOSS_LIMIT || '200'), // USD — stop trading if balance drops this much today
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

/**
 * Refresh mutable `config` fields from process.env after dashboard PATCH or runtime edits.
 */
export function syncConfigFromEnv(): void {
  config.botToken = process.env.BOT_TOKEN || '';
  config.nodeEnv = process.env.NODE_ENV || 'development';
  config.instanceType = process.env.INSTANCE_TYPE || 'production';
  config.botEnabled = process.env.BOT_ENABLED !== 'false';
  config.dashboardEnabled = process.env.DASHBOARD_ENABLED !== 'false';
  config.dashboardPort = parseInt(process.env.DASHBOARD_PORT || '3000', 10);

  config.metaApi.token = process.env.METAAPI_TOKEN || '';
  config.metaApi.accountId = process.env.METAAPI_ACCOUNT_ID || '';
  config.metaApi.accounts =
    process.env.METAAPI_ACCOUNTS || process.env.METAAPI_TEST_ACCOUNT || '';

  config.allowedChannelId = process.env.ALLOWED_CHANNEL_ID || '';
  config.allowedChannelUsername = process.env.ALLOWED_CHANNEL_USERNAME || '';
  config.notificationChatId = process.env.NOTIFICATION_CHAT_ID || process.env.ALLOWED_CHANNEL_ID || '';

  config.trading.fixedLotSize = parseFloat(process.env.FIXED_LOT_SIZE || '0.45');
  config.trading.cryptoLotSize = parseFloat(process.env.CRYPTO_LOT_SIZE || '0.05');
  config.trading.maxTradeSize = parseFloat(process.env.MAX_TRADE_SIZE || '1.0');
  config.trading.riskPercentage = parseFloat(process.env.RISK_PERCENTAGE || '1.3');
  config.trading.fixedRiskAmount = parseFloat(process.env.FIXED_RISK_AMOUNT || '50');
  config.trading.enforceOneToOneRR = process.env.ENFORCE_1_1_RR !== 'false';
  config.trading.defaultOrderType = process.env.DEFAULT_ORDER_TYPE || 'MARKET';
  config.trading.useSmartOrderType = process.env.USE_SMART_ORDER_TYPE !== 'false';
  config.trading.limitOrderSlippage = parseFloat(process.env.LIMIT_ORDER_SLIPPAGE || '5');
  config.trading.pendingOrderExpiration = parseInt(process.env.PENDING_ORDER_EXPIRATION || '4', 10);
  config.trading.enableAdvancedOrderTypes = process.env.ENABLE_ADVANCED_ORDER_TYPES !== 'false';

  config.limits.maxDailyTrades = parseInt(process.env.MAX_DAILY_TRADES || '5', 10);
  config.limits.dailyLossLimit = parseFloat(process.env.DAILY_LOSS_LIMIT || '200');

  config.logging.level = process.env.LOG_LEVEL || 'info';
}

export const validateConfig = (): boolean => {
  console.log('🔍 CRITICAL: Validating configuration for production safety...');
  
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required configuration
  const required = [
    { name: 'BOT_TOKEN', value: config.botToken },
    { name: 'ALLOWED_CHANNEL_ID', value: config.allowedChannelId }
    // METAAPI_TOKEN is now optional - users configure their own accounts
  ];

  // JWT authentication removed - trading-only system

  // Check required fields
  const missing = required.filter(field => !field.value || field.value.length === 0);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(field => {
      console.error(`   - ${field.name}: ${field.value ? 'empty' : 'not set'}`);
      errors.push(`${field.name} is required`);
    });
  }

  // MetaAPI accounts are now user-configurable through dashboard - not required at startup
  const hasAccountConfig = config.metaApi.accountId || config.metaApi.accounts;
  if (!hasAccountConfig) {
    warnings.push('INFO: No MetaAPI accounts configured - users can add accounts through the dashboard');
    console.log('ℹ️ MetaAPI accounts will be configured by users through the dashboard interface');
  }

  // Validate multi-account format if provided.
  // Format: "accountId:brokerName:accountType" with an optional 4th field naming the
  // env var that holds this account's own MetaAPI token (e.g. METAAPI_TOKEN_2). Accounts
  // without a 4th field fall back to the default METAAPI_TOKEN.
  if (config.metaApi.accounts) {
    const accountStrings = config.metaApi.accounts.split(',');
    accountStrings.forEach((accountStr, index) => {
      const parts = accountStr.trim().split(':');
      if (parts.length < 3 || parts.length > 4) {
        errors.push(`CRITICAL: Invalid account format at index ${index}: "${accountStr}". Expected format: "accountId:brokerName:accountType" with an optional ":tokenEnvVarName"`);
        console.error(`❌ Invalid account format: ${accountStr}`);
      } else {
        const [id, broker, type, tokenEnvName] = parts;
        if (!id.trim() || !broker.trim() || !type.trim()) {
          errors.push(`CRITICAL: Empty values in account config: "${accountStr}"`);
        }
        if (!['DEMO', 'LIVE'].includes(type.trim().toUpperCase())) {
          warnings.push(`WARNING: Account type "${type}" should be DEMO or LIVE`);
          console.warn(`⚠️ Account type "${type}" should be DEMO or LIVE`);
        }
        // If this account declares its own token env var, make sure it actually resolves
        if (tokenEnvName !== undefined) {
          const envName = tokenEnvName.trim();
          if (!envName) {
            errors.push(`CRITICAL: Empty token env var name in account config: "${accountStr}"`);
          } else if (!process.env[envName]) {
            errors.push(`CRITICAL: Account "${broker.trim()}" references token env var "${envName}" but it is not set`);
            console.error(`❌ Token env var "${envName}" referenced by ${broker.trim()} is not set`);
          }
        }
      }
    });
  }

  // Warn if risk amount looks account-blowing (> 20% of any reasonable small account)
  if (config.trading.fixedRiskAmount > 100) {
    warnings.push(`WARNING: FIXED_RISK_AMOUNT=$${config.trading.fixedRiskAmount} is high — ensure this is ≤2% of your account balance`);
    console.warn(`⚠️ FIXED_RISK_AMOUNT=$${config.trading.fixedRiskAmount} — set to 1-2% of balance (e.g. $${Math.round(715 * 0.02)} for a $715 account)`);
  }

  if (!config.notificationChatId) {
    warnings.push('WARNING: NOTIFICATION_CHAT_ID not set — trade alerts disabled. Message the bot and use /chatid to get your ID.');
    console.warn('⚠️ No NOTIFICATION_CHAT_ID set. Send /chatid to the bot to get your personal chat ID.');
  }

  // Validate trading parameters
  if (config.trading.maxTradeSize <= 0 || config.trading.maxTradeSize > 100) {
    warnings.push('WARNING: MAX_TRADE_SIZE should be between 0.01 and 100');
    console.warn('⚠️ MAX_TRADE_SIZE seems unusual:', config.trading.maxTradeSize);
  }

  if (config.trading.maxTradeSize < config.trading.fixedLotSize) {
    warnings.push(
      `WARNING: MAX_TRADE_SIZE (${config.trading.maxTradeSize}) is less than FIXED_LOT_SIZE (${config.trading.fixedLotSize}) — trades will always be capped at ${config.trading.maxTradeSize} lots`
    );
    console.warn(
      `⚠️ CONFIG CONFLICT: MAX_TRADE_SIZE=${config.trading.maxTradeSize} < FIXED_LOT_SIZE=${config.trading.fixedLotSize}. Every trade will be capped.`
    );
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

  // Optional MetaAPI token validation - only if provided
  if (config.metaApi.token && config.metaApi.token.length < 50) {
    warnings.push('WARNING: METAAPI_TOKEN appears too short - verify it\'s the complete token');
    console.warn('⚠️ MetaAPI token seems incomplete (users can configure individual accounts)');
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
