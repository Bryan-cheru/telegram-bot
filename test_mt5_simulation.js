const fs = require('fs');
const path = require('path');

// Simulate MT5 EA processing
class MT5TradeSimulator {
  constructor() {
    this.signalsPath = './MT5_Files/MQL5/Files/trade_signals/';
    this.executedPath = './MT5_Files/MQL5/Files/trade_signals/executed/';
  }

  processSignals() {
    console.log('🔍 MT5 EA Simulator - Checking for trade signals...');
    console.log(`📁 Signals path: ${this.signalsPath}`);
    
    try {
      const files = fs.readdirSync(this.signalsPath).filter(f => f.endsWith('.json'));
      
      if (files.length === 0) {
        console.log('📭 No pending trade signals found');
        return;
      }
      
      console.log(`📋 Found ${files.length} trade signal(s): ${files.join(', ')}`);
      
      files.forEach(file => {
        this.processSignalFile(file);
      });
      
    } catch (error) {
      console.error('❌ Error reading signals directory:', error.message);
    }
  }
  
  processSignalFile(fileName) {
    const filePath = path.join(this.signalsPath, fileName);
    
    try {
      console.log(`\n🔄 Processing: ${fileName}`);
      
      // Read the JSON file
      const jsonContent = fs.readFileSync(filePath, 'utf8');
      const signalData = JSON.parse(jsonContent);
      
      console.log('📊 Trade Signal Details:');
      console.log(`   Symbol: ${signalData.signal.symbol}`);
      console.log(`   Action: ${signalData.signal.action}`);
      console.log(`   Entry Zone: ${signalData.signal.entryZone.min} - ${signalData.signal.entryZone.max}`);
      console.log(`   Stop Loss: ${signalData.signal.stopLoss}`);
      console.log(`   Targets: ${signalData.signal.targets.join(', ')}`);
      console.log(`   Volume: ${signalData.volume}`);
      console.log(`   Signal ID: ${signalData.id}`);
      console.log(`   Status: ${signalData.status}`);
      
      // Simulate trade execution validation
      this.validateTradeExecution(signalData);
      
      // Simulate moving file to executed folder
      this.moveToExecuted(fileName, signalData);
      
    } catch (error) {
      console.error(`❌ Error processing ${fileName}:`, error.message);
    }
  }
  
  validateTradeExecution(signalData) {
    const signal = signalData.signal;
    
    console.log(`\n🧮 Trade Validation for ${signal.symbol}:`);
    
    // Simulate current market price (for demo)
    let currentPrice;
    if (signal.symbol === 'XAUUSD') {
      currentPrice = signal.action === 'BUY' ? signal.entryZone.max - 1 : signal.entryZone.min + 1;
    } else {
      currentPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
    }
    
    console.log(`   Current Market Price: ${currentPrice}`);
    console.log(`   Entry Zone: ${signal.entryZone.min} - ${signal.entryZone.max}`);
    
    // Check if price is in entry zone
    const inEntryZone = currentPrice >= signal.entryZone.min && currentPrice <= signal.entryZone.max;
    console.log(`   Price in Entry Zone: ${inEntryZone ? '✅ YES' : '❌ NO'}`);
    
    // Calculate risk/reward
    const entryPrice = signal.action === 'BUY' ? signal.entryZone.max : signal.entryZone.min;
    const riskPips = Math.abs(entryPrice - signal.stopLoss);
    const rewardPips = signal.targets.length > 0 ? Math.abs(entryPrice - signal.targets[0]) : 0;
    const rrRatio = rewardPips / riskPips;
    
    console.log(`   Risk: ${riskPips.toFixed(1)} pips`);
    console.log(`   Reward: ${rewardPips.toFixed(1)} pips`);
    console.log(`   Risk/Reward Ratio: 1:${rrRatio.toFixed(2)}`);
    
    if (inEntryZone && rrRatio > 1) {
      console.log('✅ TRADE WOULD BE EXECUTED');
      console.log(`   📝 Simulated Order: ${signal.action} ${signalData.volume} lots of ${signal.symbol}`);
      console.log(`   💰 Entry: ${entryPrice}`);
      console.log(`   🛑 Stop Loss: ${signal.stopLoss}`);
      console.log(`   🎯 Take Profit: ${signal.targets[0]}`);
    } else {
      console.log('⏳ TRADE WOULD BE PENDING');
      if (!inEntryZone) console.log('   Reason: Price not in entry zone');
      if (rrRatio <= 1) console.log('   Reason: Poor risk/reward ratio');
    }
  }
  
  moveToExecuted(fileName, signalData) {
    const sourcePath = path.join(this.signalsPath, fileName);
    const targetPath = path.join(this.executedPath, fileName);
    
    try {
      // Update status to executed
      signalData.status = 'executed';
      signalData.executedAt = new Date().toISOString();
      signalData.simulatedExecution = true;
      
      // Write to executed folder
      fs.writeFileSync(targetPath, JSON.stringify(signalData, null, 2));
      
      // Remove from pending folder
      fs.unlinkSync(sourcePath);
      
      console.log(`📁 File moved to executed folder: ${fileName}`);
      
    } catch (error) {
      console.error(`❌ Error moving file to executed folder:`, error.message);
    }
  }
}

// Run the simulation
const simulator = new MT5TradeSimulator();
simulator.processSignals();
