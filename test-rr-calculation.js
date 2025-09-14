console.log('🎯 TESTING 1:1 RISK-REWARD CALCULATION\n');

function test1to1RR() {
    console.log('📊 1:1 RISK-REWARD RATIO CALCULATION EXAMPLES\n');
    
    // Test scenarios
    const scenarios = [
        {
            name: 'NZDJPY BUY Signal',
            signal: {
                symbol: 'NZDJPY',
                action: 'BUY',
                entryPrice: 88.205,
                stopLoss: 87.500,
                targets: [] // No targets provided - should auto-calculate 1:1
            }
        },
        {
            name: 'GOLD SELL Signal',
            signal: {
                symbol: 'GOLD',
                action: 'SELL', 
                entryPrice: 2650.00,
                stopLoss: 2667.00,
                targets: [] // No targets provided - should auto-calculate 1:1
            }
        },
        {
            name: 'EURUSD BUY with Target',
            signal: {
                symbol: 'EURUSD',
                action: 'BUY',
                entryPrice: 1.0850,
                stopLoss: 1.0800,
                targets: [1.0920] // Target provided - should use this instead of 1:1
            }
        }
    ];
    
    // Simulate the calculateTakeProfit function
    function calculateTakeProfit(signal, entryPrice) {
        const stopLoss = signal.stopLoss;
        
        // If explicit targets provided and valid, use first target
        if (signal.targets && signal.targets.length > 0 && signal.targets[0] > 0) {
            console.log(`📋 Using provided TP: ${signal.targets[0]}`);
            return signal.targets[0];
        }

        // Calculate 1:1 Risk-Reward ratio
        let takeProfit;
        const riskDistance = Math.abs(entryPrice - stopLoss);

        if (signal.action === 'BUY') {
            // For BUY: TP = Entry + Risk Distance
            takeProfit = entryPrice + riskDistance;
            console.log(`📈 BUY 1:1 RR: Entry ${entryPrice} + Risk ${riskDistance.toFixed(5)} = TP ${takeProfit.toFixed(5)}`);
        } else if (signal.action === 'SELL') {
            // For SELL: TP = Entry - Risk Distance
            takeProfit = entryPrice - riskDistance;
            console.log(`📉 SELL 1:1 RR: Entry ${entryPrice} - Risk ${riskDistance.toFixed(5)} = TP ${takeProfit.toFixed(5)}`);
        }

        console.log(`🎯 Applied 1:1 RR - Entry: ${entryPrice}, SL: ${stopLoss}, TP: ${takeProfit.toFixed(5)}, Risk: ${riskDistance.toFixed(5)} pips`);
        return Number(takeProfit.toFixed(5));
    }
    
    // Test each scenario
    scenarios.forEach((scenario, index) => {
        console.log(`${index + 1}. ${scenario.name.toUpperCase()}:`);
        console.log(`   Symbol: ${scenario.signal.symbol}`);
        console.log(`   Action: ${scenario.signal.action}`);
        console.log(`   Entry: ${scenario.signal.entryPrice}`);
        console.log(`   Stop Loss: ${scenario.signal.stopLoss}`);
        
        const riskDistance = Math.abs(scenario.signal.entryPrice - scenario.signal.stopLoss);
        console.log(`   Risk Distance: ${riskDistance.toFixed(5)} pips`);
        
        const calculatedTP = calculateTakeProfit(scenario.signal, scenario.signal.entryPrice);
        console.log(`   Take Profit: ${calculatedTP}`);
        
        // Calculate reward distance for verification
        const rewardDistance = Math.abs(calculatedTP - scenario.signal.entryPrice);
        const rrRatio = rewardDistance / riskDistance;
        console.log(`   Reward Distance: ${rewardDistance.toFixed(5)} pips`);
        console.log(`   R:R Ratio: 1:${rrRatio.toFixed(2)}`);
        console.log('');
    });
    
    console.log('🔥 KEY BENEFITS OF AUTOMATIC 1:1 RR:');
    console.log('├─ ✅ No manual TP calculation needed');
    console.log('├─ ✅ Consistent risk management');
    console.log('├─ ✅ Equal risk and reward on every trade');
    console.log('├─ ✅ Professional trading approach');
    console.log('└─ ✅ Protects against poor RR setups');
    console.log('');
    
    console.log('📋 HOW IT WORKS:');
    console.log('1. Bot receives signal with Entry and Stop Loss');
    console.log('2. Calculates risk distance: |Entry - SL|');
    console.log('3. Sets Take Profit at same distance from Entry');
    console.log('4. BUY: TP = Entry + Risk Distance');
    console.log('5. SELL: TP = Entry - Risk Distance');
    console.log('6. Result: Perfect 1:1 Risk-Reward ratio');
}

test1to1RR();
