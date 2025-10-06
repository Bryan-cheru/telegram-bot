/**
 * Bot Service Interface
 * Defines the contract for bot-related services
 */

export interface IBotService {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

/**
 * Trade Executor Interface
 * Defines the contract for trade execution services
 */
export interface ITradeExecutorService {
  executeSignal(signal: any): Promise<any>;
  getAccountStatus(accountId: string): Promise<any>;
  validateSignal(signal: any): Promise<boolean>;
}

/**
 * Authentication Service Interface
 */
export interface IAuthenticationService {
  authenticateUser(credentials: any): Promise<any>;
  validateToken(token: string): Promise<any>;
  registerUser(userData: any): Promise<any>;
}

/**
 * Message Processing Interface
 */
export interface IMessageProcessor {
  processMessage(ctx: any): Promise<void>;
  processPhoto(ctx: any): Promise<void>;
  processCommand(ctx: any, command: string): Promise<void>;
}