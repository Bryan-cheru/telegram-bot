# 🏢 Multi-Account Trading Setup Guide

This guide explains how to set up the Telegram Trading Bot to trade across multiple MT5 accounts simultaneously.

## 📋 Overview

The bot supports three multi-account strategies:
1. **MetaAPI Multi-Account** - Trade multiple cloud accounts
2. **Local MT5 Multi-Account** - Multiple local MT5 terminals
3. **Hybrid Setup** - Mix of MetaAPI and local accounts

---

## 🌐 Method 1: MetaAPI Multi-Account Setup

### Prerequisites
- Multiple MetaAPI accounts configured
- Active subscriptions for each account
- Account IDs and tokens from MetaAPI dashboard

### Configuration

1. **Update Environment Variables:**
```env
TRADING_MODE=metaapi
METAAPI_TOKEN=your_primary_token

# Multiple accounts (comma-separated)
METAAPI_ACCOUNT_IDS=account1,account2,account3
METAAPI_TOKENS=token1,token2,token3

# Risk management per account
ACCOUNT_RISK_LIMITS=1000,2000,1500  # USD
MAX_POSITIONS_PER_ACCOUNT=3,5,4
```

2. **Account Configuration:**
```typescript
// In config.ts, add:
export const multiAccountConfig = {
  accounts: [
    {
      id: 'account1',
      token: 'token1',
      riskLimit: 1000,
      maxPositions: 3,
      symbols: ['EURUSD', 'GBPUSD', 'XAUUSD']
    },
    {
      id: 'account2', 
      token: 'token2',
      riskLimit: 2000,
      maxPositions: 5,
      symbols: ['XAUUSD', 'XAGUSD', 'USDJPY']
    }
  ]
};
```

### Usage

The `MultiAccountMetaApiTradeExecutor` will:
- ✅ Distribute trades across accounts based on risk limits
- ✅ Monitor account health and balance
- ✅ Handle account-specific symbol restrictions
- ✅ Provide consolidated reporting

---

## 🖥️ Method 2: Local Multi-MT5 Setup

### Prerequisites
- Multiple MT5 terminals installed
- Each terminal with unique data folder
- TelegramTradingBot.mq5 installed on each terminal

### File Structure Setup
```
C:\MT5_Instance_1\MQL5\Files\trade_signals\
C:\MT5_Instance_2\MQL5\Files\trade_signals\
C:\MT5_Instance_3\MQL5\Files\trade_signals\
```

### Configuration

1. **Environment Variables:**
```env
TRADING_MODE=local
MT5_INSTANCES=3
MT5_PATHS=C:\MT5_Instance_1,C:\MT5_Instance_2,C:\MT5_Instance_3
MT5_PORTS=18812,18813,18814
```

2. **MT5 EA Settings:**
Each MT5 terminal needs unique settings:

**Terminal 1:**
```
MagicNumber = 123456
TradeSignalsPath = "trade_signals\"
```

**Terminal 2:**
```  
MagicNumber = 123457
TradeSignalsPath = "trade_signals\"
```

**Terminal 3:**
```
MagicNumber = 123458  
TradeSignalsPath = "trade_signals\"
```

---

## 🔄 Method 3: Hybrid Setup (Advanced)

Combine MetaAPI and local accounts for maximum flexibility:

```env
TRADING_MODE=hybrid

# MetaAPI Accounts
METAAPI_TOKENS=token1,token2
METAAPI_ACCOUNT_IDS=cloud_account1,cloud_account2

# Local MT5 Accounts  
LOCAL_MT5_PATHS=C:\MT5_Local1,C:\MT5_Local2
LOCAL_MT5_PORTS=18812,18813

# Account routing rules
ACCOUNT_ROUTING_RULES=symbol_based  # or risk_based, random
```

---

## 🎯 Trade Distribution Strategies

### 1. **Risk-Based Distribution**
- Distribute trades based on account balance and risk limits
- Larger accounts get proportionally more trades
- Built-in risk management per account

### 2. **Symbol-Based Distribution**
```typescript
const symbolRouting = {
  'XAUUSD': ['account1', 'account3'],    // Gold to specific accounts
  'EURUSD': ['account2'],               // Forex to dedicated account
  'CRYPTO': ['account3']                // Crypto to specialized account
};
```

### 3. **Load Balancing**
- Round-robin distribution
- Monitors account load and performance
- Automatically excludes unhealthy accounts

---

## 🔧 Implementation Code

### MultiAccountExecutor Usage:
```typescript
import { MultiAccountMetaApiTradeExecutor } from '../mt5/multiAccountMetaApiTradeExecutor';

const executor = new MultiAccountMetaApiTradeExecutor({
  accounts: multiAccountConfig.accounts,
  distributionStrategy: 'risk_based',
  enableLoadBalancing: true,
  maxRetriesPerAccount: 3
});

await executor.executeTradeSignal(signal);
```

---

## 📊 Monitoring & Management

### Account Health Monitoring:
- ✅ Balance tracking
- ✅ Drawdown monitoring  
- ✅ Connection status
- ✅ Performance metrics
- ✅ Risk limit adherence

### Alerts & Notifications:
```typescript
// Configure alerts for:
- Account connection lost
- Risk limit exceeded
- Unusual account behavior  
- Performance degradation
```

---

## ⚠️ Risk Management

### Per-Account Limits:
```env
# Maximum risk per account (% of balance)
MAX_RISK_PER_ACCOUNT=2

# Maximum open positions per account
MAX_POSITIONS_PER_ACCOUNT=5

# Daily loss limit per account (USD)
DAILY_LOSS_LIMIT_PER_ACCOUNT=500

# Emergency stop (% total portfolio loss)
EMERGENCY_STOP_PERCENTAGE=10
```

### Portfolio-Level Controls:
- Cross-account correlation limits
- Total portfolio exposure limits
- Emergency shutdown procedures
- Automated risk rebalancing

---

## 🚀 Getting Started

### Step 1: Choose Your Method
- **Beginners**: Start with MetaAPI multi-account
- **Advanced**: Use hybrid setup for maximum control
- **Local Control**: Use local multi-MT5 for full autonomy

### Step 2: Configure Accounts
1. Set up accounts (MetaAPI or local MT5)
2. Configure environment variables
3. Test with simulation mode first

### Step 3: Test & Deploy
```bash
# Test configuration
npm run test-multiactor

# Deploy with monitoring
npm run start
```

### Step 4: Monitor & Optimize
- Use the monitoring dashboard
- Adjust risk parameters based on performance
- Scale accounts based on profitability

---

## 🔍 Troubleshooting

### Common Issues:
1. **Account Connection Failures**
   - Check MetaAPI credentials
   - Verify account status and subscription
   - Check network connectivity

2. **Uneven Trade Distribution**
   - Review distribution strategy settings
   - Check account risk limits
   - Verify symbol availability per account

3. **Performance Issues**
   - Monitor account load
   - Check for overloaded accounts
   - Review execution timing

### Support:
- Check logs in `logs/multiAccount.log`
- Enable debug mode: `LOG_LEVEL=debug`
- Monitor individual account performance

---

## 📈 Advanced Features

### Custom Distribution Logic:
```typescript
class CustomDistributionStrategy {
  selectAccount(signal: TradeSignal, accounts: Account[]): Account {
    // Your custom logic here
    return bestAccount;
  }
}
```

### Portfolio Analytics:
- Cross-account performance comparison
- Risk-adjusted returns by account
- Correlation analysis between accounts
- Automated rebalancing recommendations

This multi-account setup allows you to scale your trading operation while maintaining proper risk management and monitoring across all accounts.