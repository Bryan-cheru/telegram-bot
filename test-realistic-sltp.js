/**
 * Test the new realistic SL/TP calculation
 */

// Mock the calculation logic for testing
function testRealisticSLTP() {
  console.log('🧪 Testing Realistic SL/TP Calculation\n');
  
  // Test cases with different symbols
  const testCases = [
    {
      symbol: 'USDJPY',
      entryPrice: 146.615,
      action: 'BUY',
      chartSL: 2, // Unrealistic chart SL (should be rejected)
      name: 'USDJPY BUY with bad chart SL'
    },
    {
      symbol: 'USDJPY', 
      entryPrice: 146.615,
      action: 'BUY',
      chartSL: 145.100, // Realistic chart SL
      name: 'USDJPY BUY with good chart SL'
    },
    {
      symbol: 'XAUUSD',
      entryPrice: 2650.50,
      action: 'BUY', 
      chartSL: 5, // Unrealistic chart SL
      name: 'Gold BUY with bad chart SL'
    },
    {
      symbol: 'XAUUSD',
      entryPrice: 2650.50,
      action: 'BUY',
      chartSL: 2620.50, // Realistic chart SL ($30 below)
      name: 'Gold BUY with good chart SL'
    },
    {
      symbol: 'EURUSD',
      entryPrice: 1.1050,
      action: 'SELL',
      chartSL: 7, // Unrealistic chart SL
      name: 'EURUSD SELL with bad chart SL'
    }
  ];
  
  testCases.forEach(testCase => {
    console.log(`📊 ${testCase.name}`);
    console.log(`   Entry: ${testCase.entryPrice}`);
    console.log(`   Chart SL: ${testCase.chartSL}`);
    
    // Validate if chart SL is realistic
    const isRealistic = validateRealisticSL(testCase.symbol, testCase.entryPrice, testCase.chartSL, testCase.action);
    console.log(`   Chart SL Realistic: ${isRealistic ? '✅ YES' : '❌ NO'}`);
    
    // Calculate final SL
    let finalSL;
    if (isRealistic) {
      finalSL = testCase.chartSL;
    } else {
      finalSL = calculateRealisticSL(testCase.symbol, testCase.entryPrice, testCase.action);
    }
    
    // Calculate TP (1:1 ratio)
    const riskDistance = Math.abs(testCase.entryPrice - finalSL);
    let finalTP;
    if (testCase.action === 'BUY') {
      finalTP = testCase.entryPrice + riskDistance;
    } else {
      finalTP = testCase.entryPrice - riskDistance;
    }
    
    // Apply TP limits
    finalTP = ensureRealisticTP(testCase.symbol, testCase.entryPrice, finalTP, testCase.action);
    
    console.log(`   Final SL: ${finalSL.toFixed(5)}`);
    console.log(`   Final TP: ${finalTP.toFixed(5)}`);
    console.log(`   Risk Distance: ${riskDistance.toFixed(5)}`);
    console.log(`   Risk %: ${((riskDistance / testCase.entryPrice) * 100).toFixed(2)}%`);
    console.log('   ' + '─'.repeat(50));
  });
}

function validateRealisticSL(symbol, entryPrice, stopLoss, action) {
  if (!stopLoss || stopLoss <= 0) return false;
  
  const upperSymbol = symbol.toUpperCase();
  const slDistance = Math.abs(entryPrice - stopLoss);
  const slPercentage = (slDistance / entryPrice) * 100;
  
  // Check if SL is on correct side
  if (action === 'BUY' && stopLoss >= entryPrice) return false;
  if (action === 'SELL' && stopLoss <= entryPrice) return false;
  
  // Symbol-specific validation
  if (upperSymbol.includes('JPY')) {
    return slPercentage >= 0.5 && slPercentage <= 3.0 && slDistance >= 0.5 && slDistance <= 5.0;
  }
  
  if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
    return slDistance >= 10 && slDistance <= 100;
  }
  
  if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP') || upperSymbol.includes('USD')) {
    return slDistance >= 0.0020 && slDistance <= 0.0500;
  }
  
  return slPercentage >= 0.5 && slPercentage <= 5.0;
}

function calculateRealisticSL(symbol, entryPrice, action) {
  const upperSymbol = symbol.toUpperCase();
  let slDistance;
  
  if (upperSymbol.includes('JPY')) {
    slDistance = entryPrice * 0.01; // 1% for JPY
  } else if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
    slDistance = 30; // $30 for Gold
  } else if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP') || upperSymbol.includes('USD')) {
    slDistance = 0.01; // 100 pips for major forex
  } else {
    slDistance = entryPrice * 0.015; // 1.5% general
  }
  
  if (action === 'BUY') {
    return entryPrice - slDistance;
  } else {
    return entryPrice + slDistance;
  }
}

function ensureRealisticTP(symbol, entryPrice, takeProfit, action) {
  const upperSymbol = symbol.toUpperCase();
  const tpDistance = Math.abs(takeProfit - entryPrice);
  
  let maxTpDistance;
  
  if (upperSymbol.includes('JPY')) {
    maxTpDistance = 5.0; // Max 5 yen
  } else if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
    maxTpDistance = 150; // Max $150
  } else if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP') || upperSymbol.includes('USD')) {
    maxTpDistance = 0.05; // Max 500 pips
  } else {
    maxTpDistance = entryPrice * 0.10; // Max 10%
  }
  
  if (tpDistance > maxTpDistance) {
    console.log(`   ⚠️ Capping TP from ${tpDistance.toFixed(5)} to ${maxTpDistance.toFixed(5)}`);
    
    if (action === 'BUY') {
      return entryPrice + maxTpDistance;
    } else {
      return entryPrice - maxTpDistance;
    }
  }
  
  return takeProfit;
}

// Run the test
testRealisticSLTP();
