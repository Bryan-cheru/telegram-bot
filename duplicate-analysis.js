console.log('🔍 DUPLICATE & UNUSED FILES ANALYSIS\n');

function analyzeDuplicates() {
    console.log('📊 FOUND DUPLICATE & SIMILAR FILES:\n');
    
    // Define identified duplicates and unused files
    const duplicates = [
        {
            category: 'LOGGERS',
            files: [
                'src/utils/logger.ts (MAIN - 103 lines, actively used)',
                'src/utils/enhancedLogger.ts (DUPLICATE - 118 lines, limited use)'
            ],
            status: 'DUPLICATE',
            recommendation: 'REMOVE enhancedLogger.ts',
            reason: 'Both provide logging functionality. Standard logger is more widely used.',
            impact: 'LOW - Only used by 3 files'
        },
        {
            category: 'TRADE EXECUTORS',
            files: [
                'src/mt5/cleanMultiAccountExecutor.ts (MAIN - 745 lines, current system)',
                'src/mt5/metaApiTradeExecutor.ts (OLD - 1100 lines, single account)',
                'src/mt5/multiAccountMetaApiExecutor.ts (EMPTY - 0 lines)'
            ],
            status: 'MIXED',
            recommendation: 'REMOVE empty file, REVIEW old executor',
            reason: 'cleanMultiAccountExecutor is the current implementation',
            impact: 'MEDIUM - Confusion about which executor to use'
        },
        {
            category: 'TRADING MANAGEMENT',
            files: [
                'src/utils/tradingManagementService.ts (EMPTY - 0 lines)',
                'src/utils/enhancedTradingManagementService.ts (EMPTY - 0 lines)'
            ],
            status: 'EMPTY',
            recommendation: 'REMOVE both files',
            reason: 'Both files are completely empty',
            impact: 'NONE - No functionality'
        },
        {
            category: 'OCR PARSERS',
            files: [
                'src/ocr/cleanRealWorldTradeParser.ts (MAIN - 411 lines, working)',
                'src/ocr/cleanRealWorldTradeParser_new.ts (EMPTY - 0 lines)'
            ],
            status: 'EMPTY DUPLICATE',
            recommendation: 'REMOVE _new.ts file',
            reason: 'Empty duplicate of working parser',
            impact: 'NONE - Empty file'
        },
        {
            category: 'NAMING INCONSISTENCY',
            files: [
                'src/utils/advancedStopTakeManagement.ts',
                'src/utils/enhancedRiskManager.ts',
                'src/utils/enhancedLogger.ts',
                'src/utils/enhancedTradingManagementService.ts'
            ],
            status: 'NAMING ISSUE',
            recommendation: 'STANDARDIZE naming convention',
            reason: 'Inconsistent use of "enhanced" vs "advanced" vs plain names',
            impact: 'LOW - Confusing but functional'
        }
    ];

    // Unused/Rarely used files
    const potentiallyUnused = [
        'src/utils/accountComparison.ts',
        'src/utils/automatedTesting.ts',
        'src/utils/crashRecoveryDatabase.ts',
        'src/utils/memoryManager.ts',
        'src/utils/performanceMonitor.ts',
        'src/utils/positionSizingValidator.ts',
        'src/utils/realTimeAlertSystem.ts',
        'src/utils/tradingConfig.ts',
        'src/utils/tradingSafetyControls.ts'
    ];

    // Display analysis
    duplicates.forEach((item, index) => {
        console.log(`${index + 1}. ${item.category}:`);
        console.log(`   Status: ${item.status}`);
        console.log(`   Files:`);
        item.files.forEach(file => {
            console.log(`   - ${file}`);
        });
        console.log(`   💡 Recommendation: ${item.recommendation}`);
        console.log(`   📝 Reason: ${item.reason}`);
        console.log(`   🎯 Impact: ${item.impact}`);
        console.log('');
    });

    console.log('🚨 IMMEDIATE ACTION REQUIRED:\n');
    
    const immediateActions = [
        {
            action: 'DELETE EMPTY FILES',
            files: [
                'src/utils/tradingManagementService.ts',
                'src/utils/enhancedTradingManagementService.ts',
                'src/mt5/multiAccountMetaApiExecutor.ts',
                'src/ocr/cleanRealWorldTradeParser_new.ts'
            ],
            risk: 'NONE - Files are empty'
        },
        {
            action: 'CONSOLIDATE LOGGERS',
            files: [
                'Keep: src/utils/logger.ts',
                'Remove: src/utils/enhancedLogger.ts',
                'Update: 3 import statements'
            ],
            risk: 'LOW - Need to update 3 imports'
        },
        {
            action: 'REVIEW OLD EXECUTOR',
            files: [
                'Audit: src/mt5/metaApiTradeExecutor.ts (1100 lines)',
                'Keep current: src/mt5/cleanMultiAccountExecutor.ts'
            ],
            risk: 'MEDIUM - Check if any unique functionality exists'
        }
    ];

    immediateActions.forEach((action, index) => {
        console.log(`${index + 1}. ${action.action}:`);
        action.files.forEach(file => {
            console.log(`   - ${file}`);
        });
        console.log(`   ⚠️ Risk: ${action.risk}`);
        console.log('');
    });

    console.log('📈 CLEANUP BENEFITS:');
    console.log('├─ ✅ Reduced codebase size (remove ~1400+ lines of duplicates)');
    console.log('├─ ✅ Clearer project structure');
    console.log('├─ ✅ Faster builds and deployments');
    console.log('├─ ✅ Less confusion for maintenance');
    console.log('├─ ✅ Consistent naming conventions');
    console.log('└─ ✅ Professional codebase organization');
    console.log('');

    console.log('🎯 PRIORITY ORDER:');
    console.log('1. DELETE empty files (0 risk)');
    console.log('2. CONSOLIDATE loggers (low risk)');
    console.log('3. REVIEW old executor (medium risk)');
    console.log('4. STANDARDIZE naming (optional)');
    console.log('');

    console.log('💡 ESTIMATED CLEANUP TIME: 30-45 minutes');
    console.log('💰 ESTIMATED LINES REMOVED: 1400+ lines');
    console.log('🚀 RESULT: Cleaner, more maintainable codebase');
}

analyzeDuplicates();
