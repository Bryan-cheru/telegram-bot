console.log('🎯 TESTING ENFORCED 1:1 RISK-REWARD (ALWAYS)\n');

function testEnforced1to1RR() {
    console.log('📊 ENFORCED 1:1 RR - IGNORES ALL PROVIDED TARGETS\n');
    
    // Test scenarios with different target scenarios
    const scenarios = [
        {
            name: 'NZDJPY BUY - No Targets',
            signal: {
                symbol: 'NZDJPY',
                action: 'BUY',
                entryPrice: 88.205,
                stopLoss: 87.500,
                targets: [] // No targets
            }
        },
        {
            name: 'GOLD SELL - Has Target (IGNORED)',
            signal: {
                symbol: 'GOLD',
                action: 'SELL', 
                entryPrice: 2650.00,
                stopLoss: 2667.00,
                targets: [2620.00] // Target provided but will be IGNORED
            }
        },
        {
            name: 'EURUSD BUY - Multiple Targets (IGNORED)',
            signal: {
                symbol: 'EURUSD',
                action: 'BUY',
                entryPrice: 1.0850,
                stopLoss: 1.0800,
                targets: [1.0920, 1.0950, 1.1000] // Multiple targets - ALL IGNORED
            }
        },
        {
            name: 'GBPUSD SELL - Poor RR Target (IGNORED)',
            signal: {
                symbol: 'GBPUSD',
                action: 'SELL',
                entryPrice: 1.2500,
                stopLoss: 1.2550,
                targets: [1.2480] // Poor RR (1:0.4) - IGNORED for better 1:1
            }
        }
    ];
    
    // Simulate the ENFORCED calculateTakeProfit function
    function calculateTakeProfitEnforced(signal, entryPrice) {
        const stopLoss = signal.stopLoss;
        
        // ALWAYS calculate 1:1 Risk-Reward ratio - ignore any provided targets
        let takeProfit;
        const riskDistance = Math.abs(entryPrice - stopLoss);

        if (signal.action === 'BUY') {
            takeProfit = entryPrice + riskDistance;
            console.log(`📈 BUY 1:1 RR: Entry ${entryPrice} + Risk ${riskDistance.toFixed(5)} = TP ${takeProfit.toFixed(5)}`);
        } else if (signal.action === 'SELL') {
            takeProfit = entryPrice - riskDistance;
            console.log(`📉 SELL 1:1 RR: Entry ${entryPrice} - Risk ${riskDistance.toFixed(5)} = TP ${takeProfit.toFixed(5)}`);
        }

        // Log if we're overriding provided targets
        if (signal.targets && signal.targets.length > 0 && signal.targets[0] > 0) {
            console.log(`🎯 OVERRIDE: Ignoring provided TP ${signal.targets[0]}, using 1:1 RR instead: ${takeProfit.toFixed(5)}`);
        }

        console.log(`🎯 ENFORCED 1:1 RR - Entry: ${entryPrice}, SL: ${stopLoss}, TP: ${takeProfit.toFixed(5)}, Risk: ${riskDistance.toFixed(5)} pips`);
        return Number(takeProfit.toFixed(5));
    }
    
    // Test each scenario
    scenarios.forEach((scenario, index) => {
        console.log(`${index + 1}. ${scenario.name.toUpperCase()}:`);
        console.log(`   Symbol: ${scenario.signal.symbol}`);
        console.log(`   Action: ${scenario.signal.action}`);
        console.log(`   Entry: ${scenario.signal.entryPrice}`);
        console.log(`   Stop Loss: ${scenario.signal.stopLoss}`);
        
        if (scenario.signal.targets && scenario.signal.targets.length > 0) {
            console.log(`   📋 Signal Provided Targets: [${scenario.signal.targets.join(', ')}]`);
            
            // Calculate what the RR would be with provided target
            const providedTarget = scenario.signal.targets[0];
            const riskDistance = Math.abs(scenario.signal.entryPrice - scenario.signal.stopLoss);
            const rewardDistance = Math.abs(providedTarget - scenario.signal.entryPrice);
            const providedRR = rewardDistance / riskDistance;
            console.log(`   📊 Provided Target RR: 1:${providedRR.toFixed(2)} (${providedRR < 1 ? 'POOR' : providedRR > 1 ? 'GOOD' : 'PERFECT'})`);
        } else {
            console.log(`   📋 No targets provided`);
        }
        
        const calculatedTP = calculateTakeProfitEnforced(scenario.signal, scenario.signal.entryPrice);
        console.log(`   ✅ FINAL Take Profit: ${calculatedTP} (ALWAYS 1:1 RR)`);
        console.log('');
    });
    
    console.log('🔥 ENFORCED 1:1 RR BENEFITS:');
    console.log('├─ ✅ CONSISTENT risk management across ALL trades');
    console.log('├─ ✅ NO bad RR ratios from signal providers');
    console.log('├─ ✅ PROFESSIONAL money management standards');
    console.log('├─ ✅ ELIMINATES human emotion/greed in targets');
    console.log('├─ ✅ FORCES disciplined trading approach');
    console.log('└─ ✅ MAXIMIZES long-term profitability');
    console.log('');
    
    console.log('🎯 OVERRIDE SCENARIOS:');
    console.log('• Signal says "TP: 2620" → Bot uses calculated 1:1 TP instead');
    console.log('• Signal has multiple targets → Bot ignores all, uses 1:1');
    console.log('• Signal has poor RR (1:0.5) → Bot enforces 1:1 anyway');
    console.log('• Signal has greedy RR (1:3) → Bot still uses conservative 1:1');
    console.log('');
    console.log('🚀 RESULT: Every single trade is EXACTLY 1:1 Risk-Reward!');
}

testEnforced1to1RR();
