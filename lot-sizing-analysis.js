console.log('🧮 POSITION SIZING CALCULATION BREAKDOWN\n');

function analyzePositionSizing() {
    console.log('📊 EXACT LOT SIZE CALCULATION FOR NZDJPY EXAMPLE\n');
    
    // Account Information from your .env
    const accounts = {
        'FTMO-Server3': {
            balance: 200665.19,
            brokerName: 'FTMO-Server3',
            accountId: 'b13f9d1e-4c17-4523-af26-78a97e506220'
        },
        'IFPro-Trade': {
            balance: 36602.61,
            brokerName: 'IFPro-Trade', 
            accountId: 'df208894-d0e4-4d76-995e-5939239e99c5'
        }
    };
    
    // Risk Settings from your .env
    const riskPercentage = 1.3; // RISK_PERCENTAGE=1.3
    const minLotSize = 0.01;     // MIN_LOT_SIZE=0.01
    const maxLotSize = 10.0;     // MAX_LOT_SIZE=10.0
    
    // NZDJPY Example Signal Data
    const signal = {
        symbol: 'NZDJPY',
        action: 'BUY',
        entryPrice: 88.205,     // Resistance level from chart
        stopLoss: 87.500,       // Example stop loss
        takeProfit: 88.910,     // 1:1 RR calculation
        timeframe: '4H'
    };
    
    console.log('🎯 SIGNAL DETAILS:');
    console.log(`   Symbol: ${signal.symbol}`);
    console.log(`   Entry: ${signal.entryPrice}`);
    console.log(`   Stop Loss: ${signal.stopLoss}`);
    console.log(`   Take Profit: ${signal.takeProfit}`);
    console.log(`   Risk Distance: ${signal.entryPrice - signal.stopLoss} pips`);
    console.log('');
    
    // Calculate for each account
    Object.entries(accounts).forEach(([accountName, accountData]) => {
        console.log(`💼 ${accountName.toUpperCase()} CALCULATION:`);
        console.log(`   Balance: $${accountData.balance.toLocaleString()}`);
        
        // Step 1: Calculate risk amount
        const riskAmount = accountData.balance * (riskPercentage / 100);
        console.log(`   Risk Amount (${riskPercentage}%): $${riskAmount.toFixed(2)}`);
        
        // Step 2: Calculate risk distance in pips
        const riskDistancePips = signal.entryPrice - signal.stopLoss;
        console.log(`   Risk Distance: ${riskDistancePips.toFixed(3)} pips`);
        
        // Step 3: NZDJPY pip value calculation
        // For JPY pairs: 1 pip = 0.01 for standard lot
        // Point value for NZDJPY = $10 per pip per standard lot
        const pipValue = 10; // $10 per pip per lot for JPY pairs
        console.log(`   Pip Value: $${pipValue} per pip per lot`);
        
        // Step 4: Calculate lot size
        let lotSize = riskAmount / (riskDistancePips * pipValue);
        console.log(`   Raw Calculation: $${riskAmount.toFixed(2)} ÷ (${riskDistancePips.toFixed(3)} × $${pipValue}) = ${lotSize.toFixed(4)} lots`);
        
        // Step 5: Apply constraints
        const originalLotSize = lotSize;
        lotSize = Math.max(minLotSize, Math.min(maxLotSize, lotSize));
        lotSize = Math.round(lotSize * 100) / 100; // Round to 2 decimal places
        
        console.log(`   After Constraints (${minLotSize} - ${maxLotSize}): ${lotSize} lots`);
        
        if (originalLotSize !== lotSize) {
            console.log(`   ⚠️ Lot size was ${originalLotSize > maxLotSize ? 'capped at maximum' : 'increased to minimum'}`);
        }
        
        // Step 6: Calculate actual risk with final lot size
        const actualRisk = lotSize * riskDistancePips * pipValue;
        const actualRiskPercentage = (actualRisk / accountData.balance) * 100;
        
        console.log(`   Final Lot Size: ${lotSize} lots`);
        console.log(`   Actual Risk: $${actualRisk.toFixed(2)} (${actualRiskPercentage.toFixed(2)}%)`);
        console.log(`   Position Value: $${(lotSize * signal.entryPrice * 100000).toLocaleString()}`); // NZDJPY contract size
        console.log('');
    });
    
    console.log('🔍 WHY THESE SPECIFIC LOT SIZES?');
    console.log('');
    console.log('FTMO-Server3 (10 lots):');
    console.log('├─ Large account balance: $200,665.19');
    console.log('├─ 1.3% risk = $2,608.65');
    console.log('├─ Risk distance: 0.705 pips');
    console.log('├─ Calculation: $2,608.65 ÷ (0.705 × $10) = 370 lots');
    console.log('└─ CAPPED at maximum 10 lots due to MAX_LOT_SIZE limit');
    console.log('');
    console.log('IFPro-Trade (1.44 lots):');
    console.log('├─ Smaller account balance: $36,602.61');
    console.log('├─ 1.3% risk = $475.83');
    console.log('├─ Risk distance: 0.705 pips');
    console.log('├─ Calculation: $475.83 ÷ (0.705 × $10) = 67.5 lots');
    console.log('└─ CAPPED at maximum 10 lots, but why 1.44?');
    console.log('');
    
    console.log('🚨 ACTUAL ISSUE IDENTIFIED:');
    console.log('The current calculateVolume() method in cleanMultiAccountExecutor.ts');
    console.log('is using a SIMPLIFIED calculation (1% risk, hardcoded $1000 divisor)');
    console.log('instead of the sophisticated PositionSizeCalculator system!');
    console.log('');
    
    console.log('📝 CURRENT BROKEN CODE:');
    console.log('```typescript');
    console.log('private calculateVolume(connection: any): number {');
    console.log('  const balance = accountInfo?.balance || 10000;');
    console.log('  const riskAmount = balance * 0.01; // WRONG: Using 1% instead of 1.3%');
    console.log('  let volume = Math.max(0.01, Math.min(1.0, riskAmount / 1000)); // WRONG: Hardcoded division');
    console.log('  return Math.round(volume * 100) / 100;');
    console.log('}');
    console.log('```');
    console.log('');
    
    console.log('✅ WHAT SHOULD HAPPEN:');
    console.log('1. Use PositionSizeCalculator class');
    console.log('2. Pass actual signal data (entry, stop loss)');
    console.log('3. Use correct risk percentage (1.3%)');
    console.log('4. Use proper NZDJPY contract specifications');
    console.log('5. Apply correct position size limits');
}

analyzePositionSizing();
