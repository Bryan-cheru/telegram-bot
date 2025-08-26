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
    config.botToken,
    config.allowedChannelId,
    config.metaApi.token,
    config.metaApi.accountId
  ];
  
  return required.every(value => value && value.length > 0);
};
