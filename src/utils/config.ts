import dotenv from 'dotenv';

dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  
  // Trading mode: 'simulation', 'metaapi', or 'local'
  tradingMode: process.env.TRADING_MODE || 'simulation',
  
  mt5: {
    host: process.env.MT5_HOST || 'localhost',
    port: parseInt(process.env.MT5_PORT || '18812')
  },
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
    config.botToken,
    config.allowedChannelId
  ];

  // For MetaAPI integration, check if tokens are provided
  const hasMetaApi = config.metaApi.token && config.metaApi.accountId;
  const hasLegacyMt5 = config.mt5.host && config.mt5.port;

  if (!hasMetaApi && !hasLegacyMt5) {
    console.warn('⚠️  Neither MetaAPI nor legacy MT5 configuration found. Trading will be disabled.');
  }
  
  return required.every(value => value && value.length > 0);
};
