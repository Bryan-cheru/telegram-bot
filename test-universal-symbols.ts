// Universal Symbol Support Test
// File: test-universal-symbols.ts

import { UniversalSymbolSupport, SymbolInfo } from './src/utils/universalSymbolSupport';
import { EnhancedSymbolDetector } from './src/utils/enhancedSymbolDetector';
import { logger } from './src/utils/logger';

// Mock MetaAPI accounts for testing
const createMockAccounts = () => {
  const mockAccounts = new Map();
  
  // Mock FTMO account
  mockAccounts.set('ftmo-demo', {
    id: 'ftmo-demo',
    brokerName: 'FTMO DEMO',
    accountType: 'DEMO',
    status: 'CONNECTED',
    connection: {
      getSymbolSpecifications: async () => [
        // Forex
        { 
          symbol: 'EURUSD', 
          description: 'Euro vs US Dollar',
          tickValue: 0.0001,
          contractSize: 100000,
          minVolume: 0.01,
          maxVolume: 100,
          volumeStep: 0.01,
          tradeMode: 'TRADE_MODE_FULL'
        },
        { 
          symbol: 'GBPUSD', 
          description: 'British Pound vs US Dollar',
          tickValue: 0.0001,
          contractSize: 100000,
          minVolume: 0.01,
          maxVolume: 100,
          volumeStep: 0.01,
          tradeMode: 'TRADE_MODE_FULL'
        },
        // Metals
        { 
          symbol: 'XAUUSD', 
          description: 'Gold vs US Dollar',
          tickValue: 1.0,
          contractSize: 100,
          minVolume: 0.01,
          maxVolume: 50,
          volumeStep: 0.01,
          tradeMode: 'TRADE_MODE_FULL'
        },
        { 
          symbol: 'XAGUSD', 
          description: 'Silver vs US Dollar',
          tickValue: 0.1,
          contractSize: 5000,
          minVolume: 0.01,
          maxVolume: 20,
          volumeStep: 0.01,
          tradeMode: 'TRADE_MODE_FULL'
        },
        // Indices
        { 
          symbol: 'US30', 
          description: 'US Wall Street 30',
          tickValue: 1.0,
          contractSize: 1,
          minVolume: 0.01,
          maxVolume: 10,
          volumeStep: 0.01,
          tradeMode: 'TRADE_MODE_FULL'
        },
        // Crypto
        { 
          symbol: 'BTCUSD', 
          description: 'Bitcoin vs US Dollar',
          tickValue: 1.0,
          contractSize: 1,
          minVolume: 0.01,
          maxVolume: 5,
          volumeStep: 0.01,
          tradeMode: 'TRADE_MODE_FULL'
        }
      ],
      getSymbolPrices: async () => [
        { symbol: 'EURUSD', bid: 1.0850, ask: 1.0852 },
        { symbol: 'GBPUSD', bid: 1.2650, ask: 1.2652 },
        { symbol: 'XAUUSD', bid: 2650.50, ask: 2651.50 },
        { symbol: 'XAGUSD', bid: 30.45, ask: 30.55 },
        { symbol: 'US30', bid: 34500, ask: 34502 },
        { symbol: 'BTCUSD', bid: 65000, ask: 65100 }
      ]
    }
  });
  
  // Mock Broker2 account with different symbols
  mockAccounts.set('broker2-demo', {
    id: 'broker2-demo',
    brokerName: 'Broker2 DEMO',
    accountType: 'DEMO',
    status: 'CONNECTED',
    connection: {
      getSymbolSpecifications: async () => [
        { 
          symbol: 'USDJPY', 
          description: 'US Dollar vs Japanese Yen',
          tickValue: 0.01,
          contractSize: 100000,
          minVolume: 0.01,
          maxVolume: 100,
          volumeStep: 0.01,
          tradeMode: 'TRADE_MODE_FULL'
        },
        { 
          symbol: 'NAS100', 
          description: 'US Tech 100',
          tickValue: 1.0,
          contractSize: 1,
          minVolume: 0.01,
          maxVolume: 10,
          volumeStep: 0.01,
          tradeMode: 'TRADE_MODE_FULL'
        },
        { 
          symbol: 'ETHUSD', 
          description: 'Ethereum vs US Dollar',
          tickValue: 1.0,
          contractSize: 1,
          minVolume: 0.01,
          maxVolume: 10,
          volumeStep: 0.01,
          tradeMode: 'TRADE_MODE_FULL'
        }
      ],
      getSymbolPrices: async () => [
        { symbol: 'USDJPY', bid: 148.50, ask: 148.52 },
        { symbol: 'NAS100', bid: 15500, ask: 15502 },
        { symbol: 'ETHUSD', bid: 2500, ask: 2502 }
      ]
    }
  });
  
  return mockAccounts;
};

async function testUniversalSymbolSupport() {
  console.log('🧪 Testing Universal Symbol Support System\n');
  
  try {
    // 1. Discovery test
    console.log('📡 Step 1: Symbol Discovery');
    const mockAccounts = createMockAccounts();
    
    const discoveredSymbols = await UniversalSymbolSupport.discoverAllSymbols(mockAccounts);
    
    console.log('✅ Symbol discovery completed!');
    console.log(`   FTMO symbols: ${Object.keys(discoveredSymbols['FTMO DEMO'] || {}).length}`);
    console.log(`   Broker2 symbols: ${Object.keys(discoveredSymbols['Broker2 DEMO'] || {}).length}\n`);
    
    // 2. Symbol validation test
    console.log('🔍 Step 2: Symbol Detection Tests');
    
    const testInputs = [
      'XAUUSD',           // Exact match
      'GOLD',             // Alias
      'gold',             // Case insensitive
      '#EURUSD',          // Hashtag
      'XAUUST',           // OCR error
      'GOLDUSD',          // Alternative format
      'Bitcoin',          // Crypto alias
      'Gold Spot / U.S. Dollar', // Chart title
      'INVALID_SYMBOL'    // Should fail
    ];
    
    for (const input of testInputs) {
      const result = await EnhancedSymbolDetector.detectSymbol(input);
      
      if (result) {
        console.log(`✅ "${input}" → ${result.symbol} (${result.confidence}% confidence, ${result.source})`);
      } else {
        console.log(`❌ "${input}" → No detection`);
      }
    }
    
    // 3. Symbol info retrieval
    console.log('\n📊 Step 3: Symbol Information Retrieval');
    
    const testSymbols = ['XAUUSD', 'EURUSD', 'US30', 'BTCUSD'];
    for (const symbol of testSymbols) {
      const symbolInfo = UniversalSymbolSupport.getSymbolInfo(symbol);
      if (symbolInfo) {
        console.log(`📈 ${symbol}:`);
        console.log(`   Type: ${symbolInfo.type}`);
        console.log(`   Broker: ${symbolInfo.brokerName}`);
        console.log(`   Min Distance: ${symbolInfo.minDistance}`);
        console.log(`   Contract Size: ${symbolInfo.contractSize}`);
        console.log(`   Active: ${symbolInfo.isActive}`);
      }
    }
    
    // 4. Generate comprehensive report
    console.log('\n📋 Step 4: Comprehensive Symbol Report');
    const report = UniversalSymbolSupport.generateSymbolReport();
    console.log(report);
    
    // 5. Test symbol categories
    console.log('🏷️ Step 5: Symbol Categories');
    const forexSymbols = UniversalSymbolSupport.getSymbolsByType('FOREX');
    const metalSymbols = UniversalSymbolSupport.getSymbolsByType('METALS');
    const indexSymbols = UniversalSymbolSupport.getSymbolsByType('INDICES');
    const cryptoSymbols = UniversalSymbolSupport.getSymbolsByType('CRYPTO');
    
    console.log(`💱 Forex: ${forexSymbols.map(s => s.symbol).join(', ')}`);
    console.log(`🥇 Metals: ${metalSymbols.map(s => s.symbol).join(', ')}`);
    console.log(`📈 Indices: ${indexSymbols.map(s => s.symbol).join(', ')}`);
    console.log(`₿ Crypto: ${cryptoSymbols.map(s => s.symbol).join(', ')}\n`);
    
    console.log('✅ Universal Symbol Support Test Completed Successfully!');
    console.log(`🌍 Total unique symbols supported: ${UniversalSymbolSupport.getAllSupportedSymbols().length}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testUniversalSymbolSupport();
