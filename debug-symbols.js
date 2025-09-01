const MetaApi = require('metaapi.cloud-sdk').default;

async function testSymbols() {
  try {
    const api = new MetaApi(process.env.METAAPI_TOKEN || 'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiJkYmI3ODhmZi04MDk0LTQ4YjgtOGMzNS1iNTAzZDFhODZjZGUiLCJwZXJtaXNzaW9ucyI6WyJhY2NvdW50OnJlYWQiLCJhY2NvdW50OndyaXRlIiwidHJhZGluZzpyZWFkIiwidHJhZGluZzp3cml0ZSIsIm1ldGF0cmFkZXI6cmVhZCIsIm1ldGF0cmFkZXI6d3JpdGUiLCJwcm92aXNpb25pbmc6cmVhZCIsInByb3Zpc2lvbmluZzp3cml0ZSJdLCJ0b2tlbklkIjoiMjAyMC0xMC0wN1QxMjo1Nzo0NS4xNzhaIiwiaWF0IjoxNzI1MDE2Njk1LCJleHAiOjE3MzI3OTI2OTV9.WLiUbNHBCvVwWWJTPr6jJh4WelN1SHEApVHkP7XqvYNdGdT_XOVjWqQsZXLpqF7QDh2CWtGe3lh_4dFYJJ9HQNUvj7rqKpGVLcObhZnzCOWU1W5Q8M5qzX6vALTc3r3iMw-dKF7r7z4K5qZ3T8X6Y0vL-wU8m_Rz1J4P0kL3g8Z6Q5f4D1mQZl8W-p0V8R_9qT2G0A3S4nF5Xx3N4rO0K9J3L6Bb9W7H1qZ5c2S8E0GW2VQ6K4Z-V4M1pN7f9_sG8k4JwKJfq_l2H3Q6F8z5v1U5I3o4J-B2qR3tM0C7sG1zF0W2x8qH');
    
    // Get FTMO account
    const account = await api.metatraderAccountApi.getAccount('f29bf66f-1cee-46df-9980-8eb68d7a336c');
    
    console.log('🔍 Testing symbol availability on FTMO account...');
    console.log(`📊 Account: ${account.name} (${account.server})`);
    
    await account.waitConnected();
    
    const connection = account.getRPCConnection();
    await connection.connect();
    await connection.waitSynchronized();
    
    const symbolsToTest = ['XAUUSD', 'XAGUSD', 'EURCAD', 'EURUSD', 'GBPUSD'];
    
    console.log('\n📋 Testing symbol specifications:');
    
    for (const symbol of symbolsToTest) {
      try {
        const spec = await connection.getSymbolSpecification(symbol);
        console.log(`✅ ${symbol}:`, {
          description: spec.description,
          digits: spec.digits,
          minVolume: spec.minVolume,
          maxVolume: spec.maxVolume,
          volumeStep: spec.volumeStep,
          contractSize: spec.contractSize
        });
      } catch (error) {
        console.log(`❌ ${symbol}: ERROR - ${error.message}`);
      }
    }
    
    console.log('\n💹 Testing symbol prices:');
    
    for (const symbol of symbolsToTest) {
      try {
        const price = await connection.getSymbolPrice(symbol);
        console.log(`✅ ${symbol}:`, {
          bid: price.bid,
          ask: price.ask,
          time: price.time
        });
      } catch (error) {
        console.log(`❌ ${symbol}: ERROR - ${error.message}`);
      }
    }
    
    await connection.close();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSymbols();
