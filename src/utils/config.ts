import dotenv from 'dotenv';

dotenv.config();

interface MetaApiAccount {
  token: string;
  accountId: string;
  name?: string;
  riskPercentage?: number;
  maxTradeSize?: number;
}

export type { MetaApiAccount };

// Parse multiple MetaAPI accounts from environment variables
const parseMetaApiAccounts = (): MetaApiAccount[] => {
  const accounts: MetaApiAccount[] = [];
  
  // Support both single account (legacy) and multiple accounts
  const singleToken = process.env.METAAPI_TOKEN || '';
  const singleAccountId = process.env.METAAPI_ACCOUNT_ID || '';
  
  if (singleToken && singleAccountId) {
    accounts.push({
      token: singleToken,
      accountId: singleAccountId,
      name: 'Primary Account',
      riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || '2'),
      maxTradeSize: parseFloat(process.env.MAX_TRADE_SIZE || '0.1')
    });
  }
  
  // Parse additional accounts (METAAPI_ACCOUNTS_JSON format)
  const accountsJson = process.env.METAAPI_ACCOUNTS_JSON;
  if (accountsJson) {
    try {
      const parsedAccounts = JSON.parse(accountsJson);
      if (Array.isArray(parsedAccounts)) {
        accounts.push(...parsedAccounts);
      }
    } catch (error) {
      console.error('Error parsing METAAPI_ACCOUNTS_JSON:', error);
    }
  }
  
  // Parse numbered accounts (METAAPI_TOKEN_1, METAAPI_ACCOUNT_ID_1, etc.)
  let index = 1;
  while (process.env[`METAAPI_TOKEN_${index}`] && process.env[`METAAPI_ACCOUNT_ID_${index}`]) {
    accounts.push({
      token: process.env[`METAAPI_TOKEN_${index}`]!,
      accountId: process.env[`METAAPI_ACCOUNT_ID_${index}`]!,
      name: process.env[`METAAPI_NAME_${index}`] || `Account ${index}`,
      riskPercentage: parseFloat(process.env[`METAAPI_RISK_${index}`] || process.env.RISK_PERCENTAGE || '2'),
      maxTradeSize: parseFloat(process.env[`METAAPI_MAX_SIZE_${index}`] || process.env.MAX_TRADE_SIZE || '0.1')
    });
    index++;
  }
  
  return accounts;
};

export const config = {
  // Use standardized environment variable names
  botToken: process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '',
  metaApiAccounts: parseMetaApiAccounts(),
  // Legacy single account support (will be first account in array)
  metaApi: {
    get token() { 
      return config.metaApiAccounts[0]?.token || ''; 
    },
    get accountId() { 
      return config.metaApiAccounts[0]?.accountId || ''; 
    }
  },
  allowedChannelId: process.env.TELEGRAM_CHANNEL_ID || process.env.ALLOWED_CHANNEL_ID || '',
  mt5: {
    host: process.env.MT5_HOST || 'localhost',
    port: parseInt(process.env.MT5_PORT || '18812')
  },
  trading: {
    maxTradeSize: parseFloat(process.env.MAX_TRADE_SIZE || '0.1'),
    riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || '2'),
    testMode: process.env.TEST_MODE === 'true',
    demoMode: process.env.DEMO_MODE === 'true',
    // Distribution settings for multiple accounts
    distributeTradesAcrossAccounts: process.env.DISTRIBUTE_TRADES === 'true',
    accountSelectionStrategy: process.env.ACCOUNT_STRATEGY || 'round_robin' // 'round_robin', 'all', 'weighted'
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  server: {
    port: parseInt(process.env.PORT || '3000')
  }
};

export const validateConfig = (): boolean => {
  const required = [
    config.botToken,
    config.allowedChannelId
  ];

  // Check if we have at least one MetaAPI account
  if (config.metaApiAccounts.length === 0) {
    console.error('❌ No MetaAPI accounts configured. Please set METAAPI_TOKEN and METAAPI_ACCOUNT_ID or use METAAPI_ACCOUNTS_JSON.');
    return false;
  }

  // Validate each MetaAPI account
  for (let i = 0; i < config.metaApiAccounts.length; i++) {
    const account = config.metaApiAccounts[i];
    if (!account.token || !account.accountId) {
      console.error(`❌ MetaAPI account ${i + 1} is missing token or accountId.`);
      return false;
    }
  }
  
  const hasAllRequired = required.every(value => value && value.length > 0);
  
  if (!hasAllRequired) {
    console.error('❌ Missing required configuration. Please check TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID.');
    return false;
  }

  console.log(`✅ Configuration validated successfully with ${config.metaApiAccounts.length} MetaAPI account(s)`);
  config.metaApiAccounts.forEach((account, index) => {
    console.log(`   Account ${index + 1}: ${account.name || account.accountId} (Risk: ${account.riskPercentage}%, Max Size: ${account.maxTradeSize})`);
  });
  
  return true;
};
