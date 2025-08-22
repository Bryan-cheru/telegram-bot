# Multi-Account Configuration Example

This document shows how to configure multiple MetaAPI accounts for your Telegram Trading Bot.

## Method 1: Environment Variables (Numbered Accounts)

Set up multiple accounts using numbered environment variables:

```env
# Primary account (legacy support)
METAAPI_TOKEN=your_metaapi_token_here
METAAPI_ACCOUNT_ID=your_account_id_here

# Additional accounts
METAAPI_TOKEN_1=your_first_account_token
METAAPI_ACCOUNT_ID_1=your_first_account_id
METAAPI_NAME_1=Trading Account 1
METAAPI_RISK_1=2.5
METAAPI_MAX_SIZE_1=0.15

METAAPI_TOKEN_2=your_second_account_token
METAAPI_ACCOUNT_ID_2=your_second_account_id
METAAPI_NAME_2=Trading Account 2
METAAPI_RISK_2=1.5
METAAPI_MAX_SIZE_2=0.05

METAAPI_TOKEN_3=your_third_account_token
METAAPI_ACCOUNT_ID_3=your_third_account_id
METAAPI_NAME_3=Conservative Account
METAAPI_RISK_3=1.0
METAAPI_MAX_SIZE_3=0.03
```

## Method 2: JSON Configuration

Set up accounts using a JSON configuration:

```env
METAAPI_ACCOUNTS_JSON=[
  {
    "token": "your_first_account_token",
    "accountId": "your_first_account_id", 
    "name": "Main Trading Account",
    "riskPercentage": 2.0,
    "maxTradeSize": 0.1
  },
  {
    "token": "your_second_account_token",
    "accountId": "your_second_account_id",
    "name": "Conservative Account", 
    "riskPercentage": 1.0,
    "maxTradeSize": 0.05
  },
  {
    "token": "your_third_account_token",
    "accountId": "your_third_account_id",
    "name": "Aggressive Account",
    "riskPercentage": 3.0, 
    "maxTradeSize": 0.2
  }
]
```

## Trading Strategy Configuration

Configure how trades are distributed across accounts:

```env
# Distribution strategy
DISTRIBUTE_TRADES=true

# Account selection strategy
ACCOUNT_STRATEGY=round_robin
# Options: 
# - round_robin: Rotate through accounts one by one
# - all: Execute on all accounts simultaneously  
# - weighted: Select accounts based on risk percentage
```

## Account Strategy Details

### Round Robin Strategy
- **Description**: Trades are executed on accounts in sequence
- **Use Case**: Even distribution of trades across all accounts
- **Example**: Trade 1 → Account 1, Trade 2 → Account 2, Trade 3 → Account 3, Trade 4 → Account 1...

### All Accounts Strategy  
- **Description**: Every trade signal is executed on all configured accounts
- **Use Case**: Maximum diversification, same signal on multiple accounts
- **Risk**: Higher exposure, all accounts follow same signals

### Weighted Strategy
- **Description**: Account selection probability based on risk percentage
- **Use Case**: Higher risk accounts get more trades
- **Example**: Account with 3% risk is 3x more likely to be selected than 1% risk account

## Configuration Validation

The bot will validate your configuration on startup and show:
- ✅ Total number of configured accounts
- ✅ Account names and risk settings
- ✅ Connection status for each account
- ❌ Any configuration errors

## Example Startup Log

```
✅ Configuration validated successfully with 3 MetaAPI account(s)
   Account 1: Main Trading Account (Risk: 2%, Max Size: 0.1)
   Account 2: Conservative Account (Risk: 1%, Max Size: 0.05) 
   Account 3: Aggressive Account (Risk: 3%, Max Size: 0.2)

🌐 Initializing 3 MetaAPI account(s)...
🔄 Initializing account 1: Main Trading Account
✅ Account Main Trading Account connected successfully!
🔄 Initializing account 2: Conservative Account  
✅ Account Conservative Account connected successfully!
🔄 Initializing account 3: Aggressive Account
✅ Account Aggressive Account connected successfully!
✅ All 3 MetaAPI accounts initialized successfully!
```

## Electron App Features

The desktop app provides:
- 👥 **Accounts Tab**: View all configured accounts
- 📊 **Connection Status**: Real-time connection monitoring
- ⚙️ **Strategy Display**: Current account selection strategy
- 💹 **Trade Distribution**: See which account executed each trade
- 📈 **Account Balances**: Monitor balance across accounts (when connected)

## Best Practices

1. **Use Different Risk Levels**: Configure different risk percentages for diversification
2. **Monitor All Accounts**: Regularly check connection status in the Accounts tab
3. **Start Small**: Begin with smaller position sizes when testing multiple accounts
4. **Name Your Accounts**: Use descriptive names to easily identify accounts
5. **Backup Configuration**: Keep your account credentials secure and backed up

## Troubleshooting

- **Account Not Connecting**: Check MetaAPI token and account ID
- **Missing Accounts**: Verify environment variable names and formatting
- **JSON Parse Error**: Validate JSON syntax in METAAPI_ACCOUNTS_JSON
- **Strategy Not Working**: Ensure ACCOUNT_STRATEGY is set to valid option

## Security Notes

- Keep MetaAPI tokens secure and never share them
- Use different tokens for different accounts when possible  
- Regularly rotate API tokens for security
- Monitor account activities through MetaAPI dashboard
