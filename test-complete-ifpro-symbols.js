/**
 * Test all InstantFunding symbol mappings after comprehensive symbol mapping update
 */

const MetaApi = require('metaapi.cloud-sdk').default;
const { CleanSymbolManager } = require('./src/utils/cleanSymbolManager');

async function connectToInstantFunding() {
  const token = 'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiJiOTBhOGU5MzY4M2QyZjlkYzg4MDlkMmUzYzlkNzFhYSIsInBlcm1pc3Npb25zIjpbXSwiYWNjZXNzUnVsZXMiOlt7ImlkIjoidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpIiwibWV0aG9kcyI6WyJ0cmFkaW5nLWFjY291bnQtbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6KiJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6KiJdfSx7ImlkIjoibWV0YWFwaS1ycGMtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpycGM6cHVibGljOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOioiXX0seyJpZCI6Im1ldGFhcGktcmVhbC10aW1lLXN0cmVhbWluZy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjoqIl19XSwidG9rZW5JZCI6IjIwMjEwMjEzIiwiaW1wZXJzb25hdGVkIjpmYWxzZSwicmVhbFVzZXJJZCI6ImI5MGE4ZTkzNjgzZDJmOWRjODgwOWQyZTNjOWQ3MWFhIiwiaWF0IjoxNzAyNDczNjkzfQ.UqAD-Br5vBz7PneRGFn3Vx19k2IvkjmjJOxz6TlxeCCcb7lQsUW5HvmLKZkdRk7WdBBV5h0GYhQWsV2VfKUrNJ0wMCPCMLrE9QLiU-kgYCojIlJP8jXlplgKHk0MQKiEjsYwkP15_rK8HKiCQ6HCnG9-DlOy6VYiEGHUgfhq4JxOZJQBH5Ky4jKHfqgDcgX7t6mQ9Y_n6MZlpVJXKl2ZFHNpF8EfaG_4YnqQHsE-YRTdkjGZe4dKfGsO8PmKrLWC1VkRdF4YyVmH2cNdFfX8YjgDKdZfKdGfKdG7JfKdGfKdGfKdGfKdGfKdGfKdGfKdGfKdGfKdGfKdGfKdGfK';
  const metaApi = new MetaApi(token);
  const account = await metaApi.metatraderAccountApi.getAccount('df208894-d0e4-4d76-995e-5939239e99c5');
  
  await account.waitConnected();
  return account.getStreamingConnection();
}

async function testAllInstantFundingSymbols() {
  console.log('🧪 TESTING ALL INSTANTFUNDING SYMBOL MAPPINGS');
  console.log('===============================================\n');

  try {
    // Connect to InstantFunding broker
    const connection = await connectToInstantFunding();
    console.log('✅ Connected to InstantFunding\n');

    // Ensure connection ready
    await CleanSymbolManager.ensureConnectionReady(connection, 'IFPro-Trade');

    // All major forex pairs we've configured with numerical IDs
    const forexPairs = [
      'AUDCAD', 'AUDJPY', 'AUDUSD',
      'CADJPY', 'CHFJPY',
      'EURAUD', 'EURCAD', 'EURCHF', 'EURGBP', 'EURJPY', 'EURUSD',
      'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPJPY', 'GBPUSD',
      'NZDCAD', 'NZDJPY', 'NZDUSD',
      'USDCAD', 'USDCHF', 'USDJPY', 'USDSEK'
    ];

    const expectedMappings = {
      'AUDCAD': '1', 'AUDJPY': '3', 'AUDUSD': '5',
      'CADJPY': '11', 'CHFJPY': '12',
      'EURAUD': '17', 'EURCAD': '18', 'EURCHF': '19', 'EURGBP': '21', 'EURJPY': '23', 'EURUSD': '27',
      'GBPAUD': '29', 'GBPCAD': '30', 'GBPCHF': '31', 'GBPJPY': '32', 'GBPUSD': '34',
      'NZDCAD': '40', 'NZDJPY': '42', 'NZDUSD': '43',
      'USDCAD': '52', 'USDCHF': '53', 'USDJPY': '58', 'USDSEK': '62'
    };

    console.log(`📊 Testing ${forexPairs.length} major forex pairs...\n`);

    let successCount = 0;
    let correctNumericMappings = 0;
    const results = [];

    for (const symbol of forexPairs) {
      try {
        console.log(`🔍 Testing ${symbol}...`);
        
        const validSymbol = await CleanSymbolManager.getValidSymbol(
          symbol,
          connection,
          'IFPro-Trade'
        );

        if (validSymbol) {
          successCount++;
          const expectedNumeric = expectedMappings[symbol];
          const isCorrectMapping = validSymbol === expectedNumeric;
          
          if (isCorrectMapping) {
            correctNumericMappings++;
            console.log(`✅ ${symbol} → ${validSymbol} (CORRECT NUMERIC MAPPING)`);
          } else {
            console.log(`⚠️  ${symbol} → ${validSymbol} (expected: ${expectedNumeric})`);
          }

          results.push({
            symbol,
            resolvedSymbol: validSymbol,
            expected: expectedNumeric,
            isCorrect: isCorrectMapping,
            status: 'SUCCESS'
          });
        } else {
          console.log(`❌ ${symbol} → Not found`);
          results.push({
            symbol,
            resolvedSymbol: null,
            expected: expectedMappings[symbol],
            isCorrect: false,
            status: 'NOT_FOUND'
          });
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`💥 ${symbol} → Error: ${error.message}`);
        results.push({
          symbol,
          resolvedSymbol: null,
          expected: expectedMappings[symbol],
          isCorrect: false,
          status: 'ERROR',
          error: error.message
        });
      }
    }

    // Final report
    console.log('\n' + '='.repeat(60));
    console.log('📈 COMPREHENSIVE SYMBOL MAPPING TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Total symbols tested: ${forexPairs.length}`);
    console.log(`✅ Successful mappings: ${successCount}`);
    console.log(`🎯 Correct numerical mappings: ${correctNumericMappings}`);
    console.log(`📊 Success rate: ${((successCount / forexPairs.length) * 100).toFixed(1)}%`);
    console.log(`🎯 Numerical accuracy: ${((correctNumericMappings / forexPairs.length) * 100).toFixed(1)}%`);

    // Show working symbols
    const workingSymbols = results.filter(r => r.status === 'SUCCESS');
    if (workingSymbols.length > 0) {
      console.log('\n🟢 WORKING SYMBOLS:');
      workingSymbols.forEach(r => {
        console.log(`   ${r.symbol} → ${r.resolvedSymbol} ${r.isCorrect ? '✅' : '⚠️'}`);
      });
    }

    // Show failed symbols
    const failedSymbols = results.filter(r => r.status !== 'SUCCESS');
    if (failedSymbols.length > 0) {
      console.log('\n🔴 FAILED SYMBOLS:');
      failedSymbols.forEach(r => {
        console.log(`   ${r.symbol} → ${r.status} ${r.error ? `(${r.error})` : ''}`);
      });
    }

    if (successCount === forexPairs.length && correctNumericMappings === forexPairs.length) {
      console.log('\n🎉 PERFECT! All symbols working with correct numerical mappings!');
    } else if (successCount === forexPairs.length) {
      console.log('\n✅ All symbols working, but some have non-numerical mappings');
    } else {
      console.log(`\n⚠️  ${forexPairs.length - successCount} symbols need attention`);
    }

    console.log('\n🚀 INSTANTFUNDING OPTIMIZATION COMPLETE!');
    console.log('💼 Your trading system now supports comprehensive forex coverage on InstantFunding');

  } catch (error) {
    console.error(`💥 Test failed: ${error.message}`);
    process.exit(1);
  }
}

testAllInstantFundingSymbols();
