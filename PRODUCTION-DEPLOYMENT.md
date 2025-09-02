# 🚀 PRODUCTION DEPLOYMENT GUIDE

## ⚠️ **CRITICAL SAFETY CHANGES IMPLEMENTED**

This bot has been upgraded with **production-grade safety controls**. Please review these changes before deployment:

### **🛡️ New Safety Features**

1. **Trading Safety Controls**
   - Maximum daily loss limits
   - Position size validation
   - Trade frequency limits
   - Emergency stop functionality
   - Drawdown protection

2. **Configuration Management**
   - All hardcoded values moved to configuration
   - Environment-based settings
   - Price range validation
   - Risk management parameters

3. **Proper Logging**
   - Replaced 60+ console.log statements with structured logging
   - Log levels (debug, info, warn, error)
   - Production-ready log format

4. **Error Handling**
   - No more silent error catching
   - Proper error logging and recovery
   - Circuit breakers for critical failures

5. **Testing Framework**
   - Jest unit tests for critical components
   - Safety control validation
   - Configuration testing

## **🔧 Pre-Deployment Checklist**

### **1. Environment Configuration**
```bash
# Copy production configuration
cp .env.production .env

# Update with your actual values
nano .env
```

**Required Environment Variables:**
- `BOT_TOKEN` - Your Telegram bot token
- `ALLOWED_CHANNEL_ID` - Channel to monitor
- `METAAPI_TOKEN` - Your MetaAPI token
- `METAAPI_ACCOUNTS` - Multi-account configuration
- `MAX_DAILY_LOSS` - Maximum daily loss limit ($)
- `MAX_DAILY_TRADES` - Maximum trades per day
- `MIN_ACCOUNT_BALANCE` - Minimum balance to trade

### **2. Safety Validation**
```bash
# Run safety tests
npm test

# Check configuration
npm run lint

# Validate build
npm run build
```

### **3. Demo Testing**
Before using live accounts:
```bash
# Set demo accounts only
METAAPI_ACCOUNTS=demo_account_1:FTMO:DEMO,demo_account_2:Pepperstone:DEMO

# Test with small amounts
MAX_DAILY_LOSS=50
DEFAULT_LOT_SIZE=0.01
```

## **💰 Risk Management Settings**

### **Conservative (Recommended)**
```bash
DEFAULT_RISK_PERCENTAGE=1.0
MAX_RISK_PERCENTAGE=1.5
MAX_DAILY_LOSS=200
MAX_DAILY_TRADES=5
MAX_DRAWDOWN_PERCENTAGE=5.0
```

### **Moderate**
```bash
DEFAULT_RISK_PERCENTAGE=2.0
MAX_RISK_PERCENTAGE=2.0
MAX_DAILY_LOSS=500
MAX_DAILY_TRADES=10
MAX_DRAWDOWN_PERCENTAGE=10.0
```

### **⚠️ Never Use**
- Risk > 3% per trade
- Daily loss > 20% of account
- More than 20 trades per day
- Drawdown > 20%

## **🚨 Emergency Procedures**

### **Emergency Stop**
The bot now includes emergency stop functionality:

```typescript
// In case of emergency, the bot will automatically stop if:
// - Daily loss limit exceeded  
// - Maximum drawdown reached
// - Too many failed trades
// - Connection issues persist

// Manual emergency stop via dashboard or:
curl -X POST http://localhost:3000/api/emergency-stop \
  -H "Content-Type: application/json" \
  -d '{"reason": "Manual intervention required"}'
```

### **Monitoring Alerts**
Set up monitoring for:
- Daily P&L exceeding limits
- Unusual trade frequency
- Connection failures
- Error rates above 5%

## **📊 Production Monitoring**

### **Dashboard Access**
- URL: `http://localhost:3000`
- Features: Real-time monitoring, safety status, trade history
- Mobile responsive for remote monitoring

### **Key Metrics to Watch**
1. **Daily P&L** - Should stay within limits
2. **Trade Success Rate** - Should be > 60%
3. **Connection Status** - All accounts connected
4. **Error Rate** - Should be < 5%
5. **Safety Triggers** - Any emergency stops

### **Log Monitoring**
```bash
# Watch logs in real-time
tail -f logs/combined.log

# Check for errors
grep "ERROR" logs/combined.log

# Monitor safety events
grep "SAFETY" logs/combined.log
```

## **🔄 Deployment Steps**

### **1. Update Dependencies**
```bash
npm install
npm audit fix
```

### **2. Build & Test**
```bash
npm run build
npm test
npm run test:coverage
```

### **3. Deploy**
```bash
# For PM2 deployment
pm2 start ecosystem.config.js

# For Docker deployment
docker build -t trading-bot .
docker run -d --env-file .env trading-bot

# For systemd service
sudo systemctl start trading-bot
```

### **4. Post-Deployment Verification**
```bash
# Check health
curl http://localhost:3000/health

# Verify dashboard
curl http://localhost:3000/api/status

# Test emergency stop
curl -X POST http://localhost:3000/api/emergency-stop -d '{"reason":"test"}'
```

## **⚠️ CRITICAL WARNINGS**

1. **TEST FIRST**: Always test with demo accounts before live deployment
2. **START SMALL**: Begin with minimum position sizes and low risk
3. **MONITOR CLOSELY**: Watch the bot for the first 24-48 hours
4. **SET ALERTS**: Configure monitoring for all safety limits
5. **HAVE KILL SWITCH**: Know how to stop the bot immediately

## **🆘 Support & Troubleshooting**

### **Common Issues**
- **High memory usage**: Restart the bot daily
- **Connection timeouts**: Check network and MetaAPI status
- **OCR failures**: Verify image quality and lighting
- **Trade rejections**: Check account balance and margin

### **Performance Optimization**
- Monitor memory usage
- Check disk space for logs
- Optimize image processing
- Review ML model performance

### **Emergency Contacts**
- Keep MetaAPI support details handy
- Have broker support contacts ready
- Know how to manually close trades

---

**Remember: This bot trades with real money. Start conservatively and scale up only after proving stability.**
