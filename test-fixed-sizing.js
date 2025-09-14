console.log('🧮 TESTING FIXED POSITION SIZING CALCULATION\n');

function testFixedPositionSizing() {
    console.log('📊 VERIFYING THE FIXED LOT SIZE CALCULATION\n');
    
    // Your account data from .env
    const accounts = {
        'FTMO-Server3': { balance: 200665.19 },
        'IFPro-Trade': { balance: 36602.61 }
    };
    
    // Your environment settings
    const RISK_PERCENTAGE = 1.3;
    const MIN_LOT_SIZE = 0.01;
    const MAX_LOT_SIZE = 10.0;
    
    // NZDJPY Example Signal
    const signal = {
        symbol: 'NZDJPY',
        entryPrice: 88.205,
        stopLoss: 87.500,
        takeProfit: 88.910, // 1:1 RR
        entryZone: { min: 88.200, max: 88.210 }
    };
    
    console.log('🎯 SIGNAL DETAILS:');
    console.log(`   Symbol: ${signal.symbol}`);
    console.log(`   Entry Zone: ${signal.entryZone.min} - ${signal.entryZone.max}`);
    console.log(`   Stop Loss: ${signal.stopLoss}`);
    console.log(`   Risk Distance: ${signal.entryPrice - signal.stopLoss} pips\n`);
    
    // Function to simulate the fixed calculation
    function calculateVolumeFixed(balance, signal) {
        const riskAmount = balance * (RISK_PERCENTAGE / 100);
        const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
        const riskDistance = Math.abs(entryPrice - signal.stopLoss);
        
        // JPY pair pip value
        const pipValue = 10; // $10 per pip per lot for NZDJPY
        
        // Calculate lot size
        let lotSize = riskAmount / (riskDistance * pipValue);
        
        // Apply limits
        lotSize = Math.max(MIN_LOT_SIZE, Math.min(MAX_LOT_SIZE, lotSize));
        lotSize = Math.round(lotSize * 100) / 100;
        
        // Calculate actual risk
        const actualRisk = lotSize * riskDistance * pipValue;
        const actualRiskPercentage = (actualRisk / balance) * 100;
        
        return {
            lotSize,
            actualRisk,
            actualRiskPercentage,
            calculation: `$${riskAmount.toFixed(2)} ÷ (${riskDistance.toFixed(3)} × $${pipValue}) = ${(riskAmount / (riskDistance * pipValue)).toFixed(4)}`
        };
    }
    
    // Test each account
    Object.entries(accounts).forEach(([accountName, accountData]) => {
        console.log(`💼 ${accountName.toUpperCase()}:`);
        console.log(`   Balance: $${accountData.balance.toLocaleString()}`);
        
        const result = calculateVolumeFixed(accountData.balance, signal);
        
        console.log(`   Risk Amount (${RISK_PERCENTAGE}%): $${(accountData.balance * (RISK_PERCENTAGE / 100)).toFixed(2)}`);
        console.log(`   Calculation: ${result.calculation}`);
        console.log(`   Before Limits: ${(accountData.balance * (RISK_PERCENTAGE / 100) / (0.705 * 10)).toFixed(4)} lots`);
        console.log(`   After Limits (${MIN_LOT_SIZE} - ${MAX_LOT_SIZE}): ${result.lotSize} lots`);
        console.log(`   Actual Risk: $${result.actualRisk.toFixed(2)} (${result.actualRiskPercentage.toFixed(2)}%)`);
        console.log('');
    });
    
    console.log('✅ EXPECTED RESULTS WITH FIXED CODE:');
    console.log('');
    console.log('FTMO-Server3:');
    console.log('├─ Balance: $200,665.19');
    console.log('├─ 1.3% Risk: $2,608.65');
    console.log('├─ Raw Calculation: $2,608.65 ÷ (0.705 × $10) = 370.02 lots');
    console.log('└─ CAPPED at MAX_LOT_SIZE: 10.0 lots');
    console.log('');
    console.log('IFPro-Trade:');
    console.log('├─ Balance: $36,602.61');
    console.log('├─ 1.3% Risk: $475.83');
    console.log('├─ Raw Calculation: $475.83 ÷ (0.705 × $10) = 67.49 lots');
    console.log('└─ CAPPED at MAX_LOT_SIZE: 10.0 lots');
    console.log('');
    console.log('🚀 BOTH ACCOUNTS NOW GET 10 LOTS (MAXIMUM ALLOWED)');
    console.log('💡 Previous broken calculation was severely under-sizing positions!');
}

testFixedPositionSizing();
