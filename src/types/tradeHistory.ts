// Trade History Types for MetaAPI Integration

export interface TradeHistoryFilter {
  accountId?: string;
  symbol?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface HistoricalDeal {
  id: string;
  positionId: string;
  orderId: string;
  symbol: string;
  type: 'DEAL_TYPE_BUY' | 'DEAL_TYPE_SELL';
  volume: number;
  price: number;
  commission: number;
  swap: number;
  profit: number;
  time: Date;
  comment?: string;
  accountId: string;
  brokerName: string;
  accountType: 'DEMO' | 'LIVE';
}

export interface HistoricalOrder {
  id: string;
  positionId?: string;
  symbol: string;
  type: 'ORDER_TYPE_BUY' | 'ORDER_TYPE_SELL' | 'ORDER_TYPE_BUY_LIMIT' | 'ORDER_TYPE_SELL_LIMIT' | 'ORDER_TYPE_BUY_STOP' | 'ORDER_TYPE_SELL_STOP';
  state: 'ORDER_STATE_STARTED' | 'ORDER_STATE_PLACED' | 'ORDER_STATE_CANCELED' | 'ORDER_STATE_PARTIAL' | 'ORDER_STATE_FILLED' | 'ORDER_STATE_REJECTED' | 'ORDER_STATE_EXPIRED';
  volume: number;
  openPrice: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  time: Date;
  doneTime?: Date;
  comment?: string;
  accountId: string;
  brokerName: string;
  accountType: 'DEMO' | 'LIVE';
}

export interface PositionHistory {
  id: string;
  symbol: string;
  type: 'POSITION_TYPE_BUY' | 'POSITION_TYPE_SELL';
  volume: number;
  openPrice: number;
  closePrice?: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  profit?: number;
  unrealizedProfit?: number;
  commission: number;
  swap: number;
  openTime: Date;
  closeTime?: Date;
  comment?: string;
  accountId: string;
  brokerName: string;
  accountType: 'DEMO' | 'LIVE';
  status: 'OPEN' | 'CLOSED';
}

export interface AccountTransaction {
  id: string;
  type: 'BALANCE' | 'CREDIT' | 'CHARGE' | 'CORRECTION' | 'BONUS' | 'COMMISSION' | 'COMMISSION_DAILY' | 'COMMISSION_MONTHLY' | 'AGENT_COMMISSION' | 'INTEREST' | 'DIVIDEND' | 'DIVIDEND_FRANKED' | 'TAX';
  amount: number;
  balance: number;
  time: Date;
  comment?: string;
  accountId: string;
  brokerName: string;
  accountType: 'DEMO' | 'LIVE';
}

export interface TradeHistoryResponse {
  deals: HistoricalDeal[];
  orders: HistoricalOrder[];
  positions: PositionHistory[];
  transactions: AccountTransaction[];
  totalCount: number;
  hasMore: boolean;
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalProfit: number;
    totalCommission: number;
    totalSwap: number;
    winRate: number;
    averageProfit: number;
    averageLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    maxProfit: number;
    maxLoss: number;
    accountsAnalyzed: string[];
  };
}

export interface TradePerformanceMetrics {
  accountId: string;
  brokerName: string;
  accountType: 'DEMO' | 'LIVE';
  period: {
    startDate: Date;
    endDate: Date;
  };
  metrics: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalProfit: number;
    grossProfit: number;
    grossLoss: number;
    netProfit: number;
    profitFactor: number;
    averageProfit: number;
    averageLoss: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    recoveryFactor: number;
    sharpeRatio: number;
    calmarRatio: number;
    totalCommission: number;
    totalSwap: number;
  };
  symbolBreakdown: Array<{
    symbol: string;
    trades: number;
    profit: number;
    winRate: number;
  }>;
  monthlyBreakdown: Array<{
    month: string;
    trades: number;
    profit: number;
    winRate: number;
  }>;
}
