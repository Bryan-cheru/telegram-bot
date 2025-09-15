/**
 * Test script to debug GBPJPY symbol availability
 * This will help us discover what GBP/JPY symbols are actually available
 */

import { CleanSymbolManager } from './src/utils/cleanSymbolManager';

// Mock MetaAPI connection with sample specifications
const createMockConnection = (symbols: string[]) => {
  const specifications: any = {};
  
  // Add some sample symbols that might be available
  symbols.forEach(symbol => {
    specifications[symbol] = {
      symbol: symbol,
      description: getSymbolDescription(symbol),
      digits: 5,
      contractSize: 100000,
      minVolume: 0.01,
      maxVolume: 100,
      tradeAllowed: true
    };
  });

  return {
    terminalState: {
      connected: true,
      synchronized: true,
      specifications: specifications
    }
  };
};

function getSymbolDescription(symbol: string): string {
  const upper = symbol.toUpperCase();
  
  if (upper.includes('GBP') && upper.includes('JPY')) {
    return 'British Pound vs Japanese Yen';
  }
  if (upper.includes('EUR') && upper.includes('USD')) {
    return 'Euro vs US Dollar';
  }
  if (upper.includes('USD') && upper.includes('CHF')) {
    return 'US Dollar vs Swiss Franc';
  }
  if (upper.includes('GOLD') || upper.includes('XAU')) {
    return 'Gold vs US Dollar';
  }
  
  return `${symbol} trading instrument`;
}

// Test different broker scenarios
async function testSymbolDiscovery() {
  console.log('🔍 Testing GBPJPY Symbol Discovery');
  console.log('=' .repeat(60));

  // Test case 1: Broker with standard GBPJPY
  console.log('\n📊 Test 1: Broker with standard GBPJPY');
  const broker1Symbols = ['EURUSD', 'GBPJPY', 'USDCHF', 'XAUUSD'];
  const connection1 = createMockConnection(broker1Symbols);
  
  try {
    const result1 = await CleanSymbolManager.getValidSymbol('GBPJPY', connection1, 'TestBroker1');
    console.log(`✅ Found: ${result1}`);
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }

  // Test case 2: Broker with alternative GBPJPY naming
  console.log('\n📊 Test 2: Broker with alternative GBPJPY naming');
  const broker2Symbols = ['EURUSD', 'GBP/JPY', 'USDCHF', 'XAUUSD'];
  const connection2 = createMockConnection(broker2Symbols);
  
  try {
    const result2 = await CleanSymbolManager.getValidSymbol('GBPJPY', connection2, 'TestBroker2');
    console.log(`✅ Found: ${result2}`);
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }

  // Test case 3: Broker with ECN suffix
  console.log('\n📊 Test 3: Broker with ECN suffix');
  const broker3Symbols = ['EURUSD', 'GBPJPY_ECN', 'USDCHF', 'XAUUSD'];
  const connection3 = createMockConnection(broker3Symbols);
  
  try {
    const result3 = await CleanSymbolManager.getValidSymbol('GBPJPY', connection3, 'TestBroker3');
    console.log(`✅ Found: ${result3}`);
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }

  // Test case 4: Broker without any GBPJPY (like your brokers)
  console.log('\n📊 Test 4: Broker without GBPJPY (like your actual brokers)');
  const broker4Symbols = ['EURUSD', 'USDCHF', 'XAUUSD', 'USDJPY', 'GBPUSD', 'EURJPY'];
  const connection4 = createMockConnection(broker4Symbols);
  
  try {
    const result4 = await CleanSymbolManager.getValidSymbol('GBPJPY', connection4, 'TestBroker4');
    console.log(`✅ Found: ${result4}`);
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }

  // Test case 5: Debug symbol listing
  console.log('\n📊 Test 5: Debug symbol listing with GBP filter');
  try {
    const gbpSymbols = await CleanSymbolManager.debugListAllSymbols(connection4, 'TestBroker4', 'GBP');
    console.log(`Found GBP symbols: ${gbpSymbols.join(', ')}`);
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }

  console.log('\n💡 Recommendations:');
  console.log('1. Check if your brokers actually offer GBPJPY trading');
  console.log('2. Log into broker platforms to see available currency pairs');
  console.log('3. Consider using constituent pairs (GBPUSD + USDJPY) for synthetic GBPJPY');
  console.log('4. Contact broker support to confirm GBPJPY availability');
}

// Run the test
testSymbolDiscovery().catch(console.error);
