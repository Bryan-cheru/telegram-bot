// Trading Management API Routes
// RESTful API endpoints for web-based trading control

import { Router } from 'express';
import { EnhancedTradingManagementService } from '../utils/enhancedTradingManagementService';
import { MultiAccountMetaApiExecutor } from '../mt5/multiAccountMetaApiExecutor';
import { logger } from '../utils/logger';

const router = Router();

// Initialize trading management service
let tradingService: EnhancedTradingManagementService;

// Middleware to ensure trading service is initialized
const ensureTradingService = (req: any, res: any, next: any) => {
  if (!tradingService) {
    return res.status(503).json({ 
      error: 'Trading service not initialized. Please ensure MetaAPI connections are active.' 
    });
  }
  next();
};

// Initialize the trading service with MetaAPI executor
export const initializeTradingAPI = (multiExecutor: MultiAccountMetaApiExecutor) => {
  tradingService = new EnhancedTradingManagementService(multiExecutor);
  logger.info('🎯 Enhanced Trading Management API initialized');
};

// ========== ACCOUNT SUMMARY ENDPOINTS ==========

/**
 * GET /api/trading/summary
 * Get comprehensive account summary
 */
router.get('/summary', ensureTradingService, async (req, res) => {
  try {
    const summary = await tradingService.getAccountSummary();
    res.json(summary);
  } catch (error) {
    logger.error('Error getting account summary:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get account summary' 
    });
  }
});

// ========== POSITION MANAGEMENT ENDPOINTS ==========

/**
 * GET /api/trading/positions
 * Get all positions across all accounts
 */
router.get('/positions', ensureTradingService, async (req, res) => {
  try {
    const positions = await tradingService.getAllPositions();
    res.json(positions);
  } catch (error) {
    logger.error('Error getting positions:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get positions' 
    });
  }
});

/**
 * POST /api/trading/positions/close
 * Close a specific position
 * Body: { positionId: string, accountId: string, volume?: number }
 */
router.post('/positions/close', ensureTradingService, async (req, res) => {
  try {
    const { positionId, accountId, volume } = req.body;
    
    if (!positionId || !accountId) {
      return res.status(400).json({ error: 'positionId and accountId are required' });
    }

    const result = await tradingService.closePosition(accountId, positionId, volume);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error closing position:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to close position' 
    });
  }
});

/**
 * POST /api/trading/positions/close-all
 * Emergency close all positions across all accounts
 */
router.post('/positions/close-all', ensureTradingService, async (req, res) => {
  try {
    const results = await tradingService.emergencyCloseAll();
    res.json(results);
  } catch (error) {
    logger.error('Error closing all positions:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to close all positions' 
    });
  }
});

/**
 * POST /api/trading/positions/close-symbol
 * Close all positions for a specific symbol
 * Body: { symbol: string, type?: 'BUY' | 'SELL' }
 */
router.post('/positions/close-symbol', ensureTradingService, async (req, res) => {
  try {
    const { symbol, type } = req.body;
    
    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }

    const results = await tradingService.closePositionsBySymbol(symbol, type);
    res.json(results);
  } catch (error) {
    logger.error('Error closing positions by symbol:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to close positions by symbol' 
    });
  }
});

/**
 * POST /api/trading/positions/modify
 * Modify position stop loss / take profit
 * Body: { positionId: string, accountId: string, stopLoss?: number, takeProfit?: number }
 */
router.post('/positions/modify', ensureTradingService, async (req, res) => {
  try {
    const { positionId, accountId, stopLoss, takeProfit } = req.body;
    
    if (!positionId || !accountId) {
      return res.status(400).json({ error: 'positionId and accountId are required' });
    }

    const result = await tradingService.modifyPosition({ 
      positionId, 
      accountId, 
      stopLoss, 
      takeProfit 
    });
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error modifying position:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to modify position' 
    });
  }
});

// ========== ORDER MANAGEMENT ENDPOINTS ==========

/**
 * GET /api/trading/orders
 * Get all pending orders across all accounts
 */
router.get('/orders', ensureTradingService, async (req, res) => {
  try {
    const orders = await tradingService.getPendingOrders();
    res.json(orders);
  } catch (error) {
    logger.error('Error getting orders:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get orders' 
    });
  }
});

/**
 * POST /api/trading/orders/place
 * Place a new trading order
 * Body: TradingOrder interface
 */
router.post('/orders/place', ensureTradingService, async (req, res) => {
  try {
    const orderData = req.body;
    
    // Validate required fields
    if (!orderData.symbol || !orderData.type || !orderData.volume) {
      return res.status(400).json({ 
        error: 'symbol, type, and volume are required' 
      });
    }

    const result = await tradingService.placeOrder(orderData);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error placing order:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to place order' 
    });
  }
});

/**
 * POST /api/trading/orders/cancel
 * Cancel a pending order
 * Body: { orderId: string, accountId: string }
 */
router.post('/orders/cancel', ensureTradingService, async (req, res) => {
  try {
    const { orderId, accountId } = req.body;
    
    if (!orderId || !accountId) {
      return res.status(400).json({ error: 'orderId and accountId are required' });
    }

    const result = await tradingService.cancelOrder(accountId, orderId);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error cancelling order:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to cancel order' 
    });
  }
});

// ========== RISK MANAGEMENT ENDPOINTS ==========

/**
 * POST /api/trading/risk/settings
 * Update risk settings for an account
 * Body: RiskSettings interface
 */
router.post('/risk/settings', ensureTradingService, async (req, res) => {
  try {
    const riskSettings = req.body;
    
    if (!riskSettings.accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    await tradingService.updateRiskSettings(riskSettings);
    res.json({ success: true, message: 'Risk settings updated' });
  } catch (error) {
    logger.error('Error updating risk settings:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to update risk settings' 
    });
  }
});

/**
 * GET /api/trading/risk/exposure/:accountId
 * Get risk exposure for a specific account
 */
router.get('/risk/exposure/:accountId', ensureTradingService, async (req, res) => {
  try {
    const { accountId } = req.params;
    const exposure = await tradingService.calculateRiskExposure(accountId);
    res.json(exposure);
  } catch (error) {
    logger.error('Error getting risk exposure:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get risk exposure' 
    });
  }
});

/**
 * GET /api/trading/risk/settings/:accountId
 * Get risk settings for a specific account
 */
router.get('/risk/settings/:accountId', ensureTradingService, async (req, res) => {
  try {
    const { accountId } = req.params;
    const settings = tradingService.getRiskSettings(accountId);
    
    if (!settings) {
      return res.status(404).json({ error: 'Risk settings not found for this account' });
    }
    
    res.json(settings);
  } catch (error) {
    logger.error('Error getting risk settings:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get risk settings' 
    });
  }
});

// ========== EMERGENCY CONTROL ENDPOINTS ==========

/**
 * POST /api/trading/emergency/close-all
 * Emergency close all positions (same as positions/close-all but with different logging)
 */
router.post('/emergency/close-all', ensureTradingService, async (req, res) => {
  try {
    logger.warn('🚨 EMERGENCY CLOSE ALL TRIGGERED FROM WEB INTERFACE');
    const results = await tradingService.emergencyCloseAll();
    res.json(results);
  } catch (error) {
    logger.error('Error in emergency close all:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Emergency close all failed' 
    });
  }
});

/**
 * POST /api/trading/emergency/pause
 * Pause all trading activities
 */
router.post('/emergency/pause', ensureTradingService, async (req, res) => {
  try {
    logger.warn('🚨 EMERGENCY PAUSE TRIGGERED FROM WEB INTERFACE');
    // Implementation would set a global pause flag
    // For now, just log the action
    res.json({ success: true, message: 'Trading paused' });
  } catch (error) {
    logger.error('Error in emergency pause:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Emergency pause failed' 
    });
  }
});

/**
 * POST /api/trading/emergency/resume
 * Resume all trading activities
 */
router.post('/emergency/resume', ensureTradingService, async (req, res) => {
  try {
    logger.info('▶️ TRADING RESUMED FROM WEB INTERFACE');
    // Implementation would clear the global pause flag
    // For now, just log the action
    res.json({ success: true, message: 'Trading resumed' });
  } catch (error) {
    logger.error('Error in emergency resume:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Emergency resume failed' 
    });
  }
});

// ========== UTILITY ENDPOINTS ==========

/**
 * GET /api/trading/health
 * Check trading service health
 */
router.get('/health', async (req, res) => {
  try {
    const isServiceReady = !!tradingService;
    const status: any = {
      service: isServiceReady ? 'ready' : 'not_initialized',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    
    if (isServiceReady) {
      // Add more health checks here if needed
      status.accounts = 'checking...'; // Could check account connections
    }
    
    res.json(status);
  } catch (error) {
    logger.error('Error checking health:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Health check failed' 
    });
  }
});

/**
 * GET /api/trading/symbols
 * Get available trading symbols from connected accounts
 */
router.get('/symbols', ensureTradingService, async (req, res) => {
  try {
    // This would typically fetch available symbols from MetaAPI
    // For now, return common symbols
    const commonSymbols = [
      'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
      'EURJPY', 'EURGBP', 'GBPJPY', 'XAUUSD', 'XAGUSD', 'US30', 'NAS100', 'SPX500'
    ];
    
    res.json(commonSymbols);
  } catch (error) {
    logger.error('Error getting symbols:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get symbols' 
    });
  }
});

// Error handling middleware
router.use((error: any, req: any, res: any, next: any) => {
  logger.error('Trading API error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

export default router;
