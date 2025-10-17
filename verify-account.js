/**
 * MetaAPI Account Verification Script
 * Directly fetches account data to confirm balance
 */

const https = require('https');

const METAAPI_TOKEN = 'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiIxNTA3ZjFkNzQ2ZGMxM2JjMmNhYTFlZmJkNWNkOGNkNCIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcmVzdC1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcmVhbC10aW1lLXN0cmVhbWluZy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtZXRhc3RhdHMtYXBpIiwibWV0aG9kcyI6WyJtZXRhc3RhdHMtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiMTUwN2YxZDc0NmRjMTNiYzJjYWExZWZiZDVjZDhjZDQiLCJpYXQiOjE3NTY3MzQyMzMsImV4cCI6MTc2NDUxMDIzM30.HwFAAkTxkZ2Suq6MZ6vs0a7KRE1spC93tZYPRxD-NGs55h9_uV5O0ytP7e0aviVP0cHUqjV8qBMcpUq3aMD-QK7ZREpCbMmZCD3IAMHO61Uk_QLL3yc_uTA3J7cxEk_l2BW_4iY4CuRuNwKnT6uy1kpvG0Dlczw2ZOBJsPDWti0q_flO8c3WM5Z98VW96XIYt2Fz9Iy2biINycFln_oVOf4eWqy65RIBE_X6ahq72vUNcPDLHqRRqi1wd28PJD5DB3w68s3u6_XcctqIkYgFo7T6rXzXVn0zFBoBFpa_Wz_9PHX0aIspAc2VeJ8580PWN951Z3ogb-eAGKmO54ZduzxaRw7j1X8JLDzi1p5mZA1achPGpRtK4DHDLap5-xggz_-beMUYOJrPoUHfE7NrGGqLt9XlhvDB_gOgRYP0ve4LzlnKv2OVOW7wiR7w9a9OFB5ha904mvyuWGOL_BHJnDEDjS_v5gtay7VzfHtLWQ7F1byHlOl7xcDvLK9jtv_o1QSzBRcZ_lHeyyT-zjoarFEx5SqwgxQUrRHEm1YiXuSXmiSelkpg9ZFLZuaE2M9N_3o6DzVTfgq8qHdRaM-tU_9KD23nHuPevsGiDKDaXnYT9SPRxMUAMEVMMDnUTVNfNzLXDtX973L3H0741JaiLZan0R4AUZ6-MDfyNjLSQNw';
const ACCOUNT_ID = 'a2b1c0aa-35bd-4fcf-827a-de8ccbf2482f';

async function verifyAccountData() {
  console.log('🔍 Verifying MetaAPI Account Data...');
  console.log(`📋 Account ID: ${ACCOUNT_ID}`);
  console.log('');

  try {
    // Get account info
    const accountInfo = await makeRequest(`/users/current/accounts/${ACCOUNT_ID}`);
    console.log('📊 Account Information:');
    console.log(`   Name: ${accountInfo.name}`);
    console.log(`   Broker: ${accountInfo.brokerName}`);
    console.log(`   Type: ${accountInfo.type}`);
    console.log(`   Status: ${accountInfo.state}`);
    console.log('');

    // Get account balance and equity
    const accountData = await makeRequest(`/users/current/accounts/${ACCOUNT_ID}/account-information`);
    console.log('💰 Current Balance Information:');
    console.log(`   Balance: $${accountData.balance?.toLocaleString() || 'N/A'}`);
    console.log(`   Equity: $${accountData.equity?.toLocaleString() || 'N/A'}`);
    console.log(`   Currency: ${accountData.currency || 'N/A'}`);
    console.log(`   Leverage: 1:${accountData.leverage || 'N/A'}`);
    console.log('');

    // Get positions if any
    const positions = await makeRequest(`/users/current/accounts/${ACCOUNT_ID}/positions`);
    console.log('📈 Open Positions:');
    if (positions && positions.length > 0) {
      positions.forEach((pos, i) => {
        console.log(`   ${i+1}. ${pos.symbol} ${pos.type} ${pos.volume} lots`);
        console.log(`      Open: ${pos.openPrice}, Current: ${pos.currentPrice}`);
        console.log(`      P&L: $${pos.unrealizedProfit?.toFixed(2) || 'N/A'}`);
      });
    } else {
      console.log('   No open positions');
    }
    console.log('');

    console.log('✅ Verification Complete - This is REAL-TIME data from MetaAPI');
    
  } catch (error) {
    console.error('❌ Error verifying account:', error.message);
  }
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${METAAPI_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

verifyAccountData();