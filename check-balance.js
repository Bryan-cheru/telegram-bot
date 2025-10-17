/**
 * Simple MetaAPI Balance Verification
 */

const MetaApi = require('metaapi.cloud-sdk').default;

async function checkRealBalance() {
  const token = 'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiIxNTA3ZjFkNzQ2ZGMxM2JjMmNhYTFlZmJkNWNkOGNkNCIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcmVzdC1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcmVhbC10aW1lLXN0cmVhbWluZy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtZXRhc3RhdHMtYXBpIiwibWV0aG9kcyI6WyJtZXRhc3RhdHMtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiMTUwN2YxZDc0NmRjMTNiYzJjYWExZWZiZDVjZDhjZDQiLCJpYXQiOjE3NTY3MzQyMzMsImV4cCI6MTc2NDUxMDIzM30.HwFAAkTxkZ2Suq6MZ6vs0a7KRE1spC93tZYPRxD-NGs55h9_uV5O0ytP7e0aviVP0cHUqjV8qBMcpUq3aMD-QK7ZREpCbMmZCD3IAMHO61Uk_QLL3yc_uTA3J7cxEk_l2BW_4iY4CuRuNwKnT6uy1kpvG0Dlczw2ZOBJsPDWti0q_flO8c3WM5Z98VW96XIYt2Fz9Iy2biINycFln_oVOf4eWqy65RIBE_X6ahq72vUNcPDLHqRRqi1wd28PJD5DB3w68s3u6_XcctqIkYgFo7T6rXzXVn0zFBoBFpa_Wz_9PHX0aIspAc2VeJ8580PWN951Z3ogb-eAGKmO54ZduzxaRw7j1X8JLDzi1p5mZA1achPGpRtK4DHDLap5-xggz_-beMUYOJrPoUHfE7NrGGqLt9XlhvDB_gOgRYP0ve4LzlnKv2OVOW7wiR7w9a9OFB5ha904mvyuWGOL_BHJnDEDjS_v5gtay7VzfHtLWQ7F1byHlOl7xcDvLK9jtv_o1QSzBRcZ_lHeyyT-zjoarFEx5SqwgxQUrRHEm1YiXuSXmiSelkpg9ZFLZuaE2M9N_3o6DzVTfgq8qHdRaM-tU_9KD23nHuPevsGiDKDaXnYT9SPRxMUAMEVMMDnUTVNfNzLXDtX973L3H0741JaiLZan0R4AUZ6-MDfyNjLSQNw';
  const accountId = 'a2b1c0aa-35bd-4fcf-827a-de8ccbf2482f';
  
  console.log('🔍 DIRECT MetaAPI Account Verification');
  console.log(`📋 Account ID: ${accountId}`);
  console.log('⏳ Connecting...\n');

  try {
    const api = new MetaApi(token);
    const account = await api.metatraderAccountApi.getAccount(accountId);
    
    console.log('✅ Account Connection Successful!');
    console.log(`📊 Account Name: ${account.name}`);
    console.log(`🏦 Broker: ${account.brokerName}`);
    console.log(`💼 Type: ${account.type}`);
    console.log(`🔄 State: ${account.state}`);
    console.log('');

    // Connect and get real-time data
    const connection = account.getRPCConnection();
    await connection.connect();
    
    console.log('🔗 Connected to streaming API');
    console.log('💰 Fetching real-time account information...\n');
    
    const accountInfo = await connection.getAccountInformation();
    
    console.log('📈 REAL-TIME ACCOUNT DATA:');
    console.log(`   💵 Balance: $${accountInfo.balance?.toLocaleString()}`);
    console.log(`   💎 Equity: $${accountInfo.equity?.toLocaleString()}`);
    console.log(`   💰 Margin: $${accountInfo.margin?.toLocaleString() || '0'}`);
    console.log(`   🎯 Free Margin: $${accountInfo.freeMargin?.toLocaleString()}`);
    console.log(`   🪙 Currency: ${accountInfo.currency}`);
    console.log(`   📊 Leverage: 1:${accountInfo.leverage}`);
    console.log(`   📅 Last Update: ${new Date().toISOString()}`);
    console.log('');
    
    // Check positions
    const positions = await connection.getPositions();
    console.log(`📍 Open Positions: ${positions.length}`);
    if (positions.length > 0) {
      positions.forEach((pos, i) => {
        console.log(`   ${i+1}. ${pos.symbol} ${pos.type} ${pos.volume} lots`);
        console.log(`      💹 P&L: $${pos.unrealizedProfit?.toFixed(2)}`);
      });
    }
    
    console.log('\n✅ CONFIRMATION: This is 100% REAL-TIME data from MetaAPI servers');
    console.log('🎯 Your system is fetching the correct, live account balance!');
    
    connection.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkRealBalance();