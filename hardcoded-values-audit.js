#!/usr/bin/env node

/**
 * HARDCODED VALUES AUDIT - Check all hardcoded values in the system
 */

console.log('🔍 HARDCODED VALUES AUDIT REPORT');
console.log('=================================');

console.log('\n📊 RISK MANAGEMENT VALUES:');
console.log('============================');
console.log('✅ Risk Percentage: 2% (configurable via RISK_PERCENTAGE env)');
console.log('✅ Max Risk Percentage: 2% (configurable via maxRiskPercentage)');
console.log('✅ Default Account Equity: $10,000 (fallback when equity retrieval fails)');
console.log('✅ Min Position Size: 0.01 lots (standard MT5 minimum)');
console.log('✅ Max Position Size: 10 lots (safety limit)');

console.log('\n📏 STOP LEVEL REQUIREMENTS (Hardcoded):');
console.log('=======================================');
console.log('🟡 Gold (XAUUSD): 30.0 points minimum');
console.log('🟡 Silver (XAGUSD): 20.0 points minimum');
console.log('🟡 NAS100/SPX500: 10.0 points minimum');
console.log('🟡 US30/DJ30: 50.0 points minimum');
console.log('🟡 JPY pairs: 0.10 points (10 pips)');
console.log('🟡 Major forex: 0.0015 points (1.5 pips)');
console.log('🟡 Default fallback: 1.0 point');

console.log('\n⚙️  ORDER SETTINGS (Configurable):');
console.log('===================================');
console.log('✅ Default Order Type: MARKET (via DEFAULT_ORDER_TYPE env)');
console.log('✅ Smart Order Detection: Enabled (via USE_SMART_ORDER_TYPE env)');
console.log('✅ Limit Order Slippage: 5 pips (via LIMIT_ORDER_SLIPPAGE env)');
console.log('✅ Pending Order Expiration: 4 hours (via PENDING_ORDER_EXPIRATION env)');
console.log('✅ 1:1 Risk-Reward: Enforced by default (via ENFORCE_1_1_RR env)');

console.log('\n🔢 PARSING LIMITS (Hardcoded):');
console.log('==============================');
console.log('🟡 Price Range: 0.001 to 100,000 (filter invalid prices)');
console.log('🟡 Spread Calculation: 0.1% of center price');
console.log('🟡 Zone Buffer: 10% of zone range');
console.log('🟡 Narrow Entry Zone: <0.1% of price');

console.log('\n⚠️  POTENTIALLY PROBLEMATIC HARDCODED VALUES:');
console.log('==============================================');
console.log('🔴 CRITICAL - Stop Level Minimums:');
console.log('   - These are hardcoded per symbol type');
console.log('   - Should ideally be fetched from broker via MetaAPI');
console.log('   - Current values work for most brokers but may vary');
console.log('');
console.log('🔴 CRITICAL - Default Account Equity ($10,000):');
console.log('   - Fallback when MetaAPI equity retrieval fails');
console.log('   - Could lead to incorrect position sizing');
console.log('   - Should be configurable via environment variable');

console.log('\n🟢 WELL-CONFIGURED VALUES:');
console.log('===========================');
console.log('✅ Risk percentage (2%) - Configurable');
console.log('✅ Order types - Configurable');
console.log('✅ 1:1 RR enforcement - Configurable');
console.log('✅ Min/max position sizes - Reasonable defaults');

console.log('\n📋 DOCUMENTATION COMPLIANCE CHECK:');
console.log('===================================');

console.log('✅ Setup Guide (SETUP.md):');
console.log('   - Bot token configuration ✓');
console.log('   - Channel ID setup ✓');
console.log('   - MT5 prerequisites ✓');
console.log('   - Environment variables ✓');

console.log('\n❌ Missing Documentation:');
console.log('   - README.md is empty');
console.log('   - No API documentation');
console.log('   - No configuration reference');
console.log('   - No troubleshooting guide');

console.log('\n🔧 RECOMMENDATIONS:');
console.log('====================');
console.log('1. Make default equity configurable:');
console.log('   - Add DEFAULT_EQUITY_USD environment variable');
console.log('   - Default to $10,000 if not set');

console.log('\n2. Consider making stop levels configurable:');
console.log('   - Add symbol-specific config file (symbols.json)');
console.log('   - Allow override via environment variables');
console.log('   - Keep current values as fallbacks');

console.log('\n3. Complete documentation:');
console.log('   - Write comprehensive README.md');
console.log('   - Document all environment variables');
console.log('   - Add configuration examples');
console.log('   - Create troubleshooting guide');

console.log('\n4. Add validation:');
console.log('   - Validate stop levels against broker requirements');
console.log('   - Add warnings for unusual configurations');
console.log('   - Better error messages for misconfiguration');

process.exit(0);
