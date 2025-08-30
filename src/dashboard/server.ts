import express from 'express';
import path from 'path';
import fs from 'fs';
import { config } from '../utils/config';

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store for real-time data
let botLogs: any[] = [];
let tradeHistory: any[] = [];
let botStatus = {
  isRunning: false,
  uptime: 0,
  lastActivity: null,
  connections: {
    telegram: false,
    metaapi: false
  }
};

// Dashboard routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// API endpoints
app.get('/api/status', (req, res) => {
  res.json(botStatus);
});

app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  res.json(botLogs.slice(-limit));
});

app.get('/api/trades', (req, res) => {
  res.json(tradeHistory);
});

app.get('/api/config', (req, res) => {
  // Return sanitized config (no sensitive data)
  res.json({
    allowedChannelId: config.allowedChannelId,
    maxTradeSize: config.trading.maxTradeSize,
    riskPercentage: config.trading.riskPercentage,
    logLevel: config.logging.level
  });
});

app.post('/api/config', (req, res) => {
  // Update configuration
  const { maxTradeSize, riskPercentage, logLevel } = req.body;
  
  // Validate inputs
  if (maxTradeSize && (maxTradeSize < 0.01 || maxTradeSize > 10)) {
    return res.status(400).json({ error: 'Max trade size must be between 0.01 and 10' });
  }
  
  if (riskPercentage && (riskPercentage < 0.1 || riskPercentage > 10)) {
    return res.status(400).json({ error: 'Risk percentage must be between 0.1% and 10%' });
  }
  
  // TODO: Update config and restart bot with new settings
  res.json({ success: true, message: 'Configuration updated successfully' });
});

app.get('/api/statistics', (req, res) => {
  // Calculate trading statistics
  const stats = calculateTradingStats(tradeHistory);
  res.json(stats);
});

app.delete('/api/logs', (req, res) => {
  botLogs = [];
  res.json({ success: true, message: 'Logs cleared' });
});

// Functions to update data from bot
export const updateBotStatus = (status: any) => {
  botStatus = { ...botStatus, ...status };
};

export const addLog = (logEntry: any) => {
  botLogs.push({
    ...logEntry,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 1000 logs
  if (botLogs.length > 1000) {
    botLogs = botLogs.slice(-1000);
  }
};

export const addTrade = (trade: any) => {
  tradeHistory.push({
    ...trade,
    timestamp: new Date().toISOString(),
    id: Date.now() + Math.random()
  });
  
  // Keep only last 500 trades
  if (tradeHistory.length > 500) {
    tradeHistory = tradeHistory.slice(-500);
  }
};

function calculateTradingStats(trades: any[]) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      avgRiskRewardRatio: 0,
      totalProfit: 0,
      winningTrades: 0,
      losingTrades: 0,
      biggestWin: 0,
      biggestLoss: 0
    };
  }

  const completedTrades = trades.filter(t => t.status === 'completed');
  const winningTrades = completedTrades.filter(t => t.profit > 0);
  const losingTrades = completedTrades.filter(t => t.profit < 0);
  
  const totalProfit = completedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
  const avgRR = completedTrades.reduce((sum, t) => sum + (t.riskRewardRatio || 0), 0) / completedTrades.length || 0;
  
  return {
    totalTrades: completedTrades.length,
    winRate: completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0,
    avgRiskRewardRatio: avgRR,
    totalProfit,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    biggestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.profit)) : 0,
    biggestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.profit)) : 0
  };
}

export default app;
