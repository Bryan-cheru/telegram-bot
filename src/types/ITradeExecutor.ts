import { TradeSignal } from './index';

export interface ITradeExecutor {
  initialize(): Promise<void>;
  executeTradeSignal(signal: TradeSignal): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    ticket?: string;
    volume?: number;
    signalId?: string;
  }>;
  getAccountEquity?(): Promise<number>; // Optional method for position sizing
  isConnected(): Promise<boolean>; // Check if executor is connected and ready
  closeConnection(): Promise<void>;
}
