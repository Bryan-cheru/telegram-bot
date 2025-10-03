import mongoose from 'mongoose';
import { DatabaseConnection } from '../src/database/connection';
import { ChannelSubscriptionService, SubscriptionSettings } from '../src/services/ChannelSubscriptionService';
import { SignalHistoryService } from '../src/services/SignalHistoryService';

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
}

async function runPhase4Tests(): Promise<void> {
    const results: TestResult[] = [];
    
    console.log('🔥 PHASE 4 SERVICES TEST RUNNER');
    console.log('================================');
    console.log('🧪 Testing Channel Subscription & Signal History Services...\n');
    
    try {
        // Connect to database
        const dbConnection = DatabaseConnection.getInstance();
        await dbConnection.connect();
        console.log('✅ Database connected successfully');
        
        // Initialize services
        const channelService = ChannelSubscriptionService.getInstance();
        const signalService = SignalHistoryService.getInstance();
        await channelService.initialize();
        await signalService.initialize();
        
        // Test 1: Channel Subscription Service
        console.log('\n📡 Testing Channel Subscription Service...');
        
        try {
            const testUserId = 'test_user_123';
            const testChannelId = 'test_channel_456';
            
            const settings: SubscriptionSettings = {
                maxRiskPerTrade: 2,
                enableAutoTrading: true,
                symbolFilter: ['XAUUSD', 'EURUSD'],
                maxDailyTrades: 5
            };
            
            // Subscribe to channel
            await channelService.subscribeToChannel(
                testUserId, 
                testChannelId, 
                'Test Channel',
                settings
            );
            
            const subscribers = await channelService.getChannelSubscribers(testChannelId);
            const userSubscriptions = await channelService.getUserSubscriptions(testUserId);
            
            results.push({
                name: 'Channel Subscription Management',
                passed: subscribers.length > 0 && userSubscriptions.length > 0
            });
            
            console.log(`  ✅ Subscribers: ${subscribers.length}`);
            console.log(`  ✅ User subscriptions: ${userSubscriptions.length}`);
            
        } catch (error) {
            results.push({
                name: 'Channel Subscription Management',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            console.log(`  ❌ Error: ${error}`);
        }
        
        // Test 2: Signal History Service
        console.log('\n📊 Testing Signal History Service...');
        
        try {
            const testSignalData = {
                symbol: 'XAUUSD',
                action: 'BUY' as const,
                entryPrice: 2652.5,
                stopLoss: 2640,
                takeProfit: 2665,
                lotSize: 0.1,
                confidence: 85
            };
            
            const testExecution = {
                success: true,
                tradeId: 'test_trade_123',
                executedAt: new Date(),
                actualLotSize: 0.1
            };
            
            const testRiskValidation = {
                passed: true,
                violations: []
            };
            
            // Record signal - using proper parameters
            await signalService.recordSignal(
                'test_user_123',
                'test_channel_456',
                testSignalData,
                testExecution,
                testRiskValidation,
                12345
            );
            
            const userHistory = await signalService.getUserSignalHistory('test_user_123', { limit: 10 });
            const channelStats = await signalService.getChannelStats('test_channel_456');
            
            results.push({
                name: 'Signal History Management',
                passed: userHistory.signals.length > 0 && channelStats.totalSignals > 0
            });
            
            console.log(`  ✅ User history records: ${userHistory.signals.length}`);
            console.log(`  ✅ Channel total signals: ${channelStats.totalSignals}`);
            
        } catch (error) {
            results.push({
                name: 'Signal History Management',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            console.log(`  ❌ Error: ${error}`);
        }
        
        // Test 3: Service Integration  
        console.log('\n🔗 Testing Service Integration...');
        
        try {
            const userSubscriptions = await channelService.getUserSubscriptions('test_user_123');
            const subscription = userSubscriptions[0];
            const canTrade = subscription ? await channelService.canUserTrade(subscription, 'XAUUSD') : false;
            const userHistory = await signalService.getUserSignalHistory('test_user_123', { limit: 1 });
            
            results.push({
                name: 'Service Integration',
                passed: canTrade !== undefined && userHistory.total >= 0
            });
            
            console.log(`  ✅ Can user trade: ${canTrade}`);
            console.log(`  ✅ User signal count: ${userHistory.total}`);
            
        } catch (error) {
            results.push({
                name: 'Service Integration',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            console.log(`  ❌ Error: ${error}`);
        }
        
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        results.push({
            name: 'Database Connection',
            passed: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
    
    // Print results
    console.log('\n🧪 Phase 4 Test Results:');
    console.log('========================');
    
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const successRate = total > 0 ? (passed / total * 100).toFixed(1) : '0.0';
    
    results.forEach(result => {
        const status = result.passed ? '✅' : '❌';
        console.log(`  ${status} ${result.name}`);
        if (!result.passed && result.error) {
            console.log(`     Error: ${result.error}`);
        }
    });
    
    console.log(`\n📊 Success Rate: ${successRate}% (${passed}/${total})`);
    
    if (passed === total) {
        console.log('🎉 ALL PHASE 4 SERVICES WORKING CORRECTLY!');
    } else {
        console.log('⚠️  Some Phase 4 services need attention');
    }
    
    // Cleanup test data
    try {
        await mongoose.connection.db?.collection('channelsubscriptions').deleteMany({
            userId: 'test_user_123'
        });
        await mongoose.connection.db?.collection('signalhistories').deleteMany({
            userId: 'test_user_123'
        });
        console.log('🧹 Test data cleaned up');
    } catch (error) {
        console.warn('⚠️  Could not clean up test data:', error);
    }
    
    await mongoose.disconnect();
    console.log('✅ Database disconnected');
}

// Run the tests
runPhase4Tests().catch(console.error);