/**
 * Clean Multi-Account Trade Executor
 * Follows MetaAPI documentation exactly - replaces the complex existing system
 */

import MetaApi from 'metaapi.cloud-sdk';
import { TradeSignal, TradeResult } from '../types';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import {
  calculateFixedDollarStopsAndTargets,
  formatPriceForInstrument,
  getPipSize,
  getPipValuePerLot
} from '../trading/riskMath';
import { getBrokerSymbolSpec, normalizeVolume } from '../trading/brokerSpec';
import { PreTradeGuard } from '../trading/preTradeGuard';

interface AccountRiskOverrides {
  useFixedLotSize?: boolean;
  fixedLotSize?: number;
}

interface AccountConfig {
  id: string;
  brokerName: string;
  accountType: 'DEMO' | 'LIVE';
  token: string; // MetaAPI token this account authenticates with (may differ per account)
  account?: any;
  connection?: any;
  status: 'CONNECTING' | 'CONNECTED' | 'FAILED';
  symbolCache: Map<string, string>; // canonical → broker symbol
  riskOverrides?: AccountRiskOverrides; // per-account overrides, falls back to global .env when unset
}

interface TradeExecutionResult {
  accountId: string;
  brokerName: string;
  success: boolean;
  message: string;
  ticket?: string;
  volume?: number;
  error?: string;
}

/**
 * Clean, reliable multi-account executor following MetaAPI best practices
 */
export class CleanMultiAccountExecutor implements ITradeExecutor {
  private apiInstances = new Map<string, any>(); // token → MetaApi instance (reused across accounts sharing a token)
  private defaultToken: string;
  private accounts = new Map<string, AccountConfig>();
  private initialized = false;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  // Centralized pre-trade safety. Every execution path funnels through
  // executeTradeSignal, so guarding it here protects text, image, manual, and
  // dashboard-API trades alike (they previously bypassed dedup + daily limits).
  private readonly guard = new PreTradeGuard(
    config.limits.maxDailyTrades,
    config.limits.dailyLossLimit
  );

  constructor() {
    const token = process.env.METAAPI_TOKEN;
    if (!token) {
      throw new Error('METAAPI_TOKEN environment variable is required');
    }

    this.defaultToken = token;
  }

  /** Shared pre-trade guard — the bot/dashboard read its daily stats and feed it balance updates. */
  getGuard(): PreTradeGuard {
    return this.guard;
  }

  /**
   * Get-or-create a MetaApi instance for a given token. Accounts that share a token
   * reuse the same instance; an account with its own token gets a dedicated one.
   */
  private getApi(token: string): any {
    let api = this.apiInstances.get(token);
    if (!api) {
      api = new MetaApi(token);
      this.apiInstances.set(token, api);
    }
    return api;
  }

  /**
   * Start a background loop that checks all accounts every 60 seconds and
   * reconnects any that have dropped to FAILED status.
   */
  private startReconnectMonitor(): void {
    if (this.reconnectTimer) return; // already running

    this.reconnectTimer = setInterval(async () => {
      const failedAccounts = Array.from(this.accounts.values()).filter(
        acc => acc.status === 'FAILED'
      );

      if (failedAccounts.length === 0) return;

      logger.warn(`🔄 Reconnect monitor: ${failedAccounts.length} account(s) FAILED — attempting reconnect...`);

      for (const accountConfig of failedAccounts) {
        accountConfig.status = 'CONNECTING';
        try {
          await this.connectAccount(accountConfig);
          if ((accountConfig.status as string) === 'CONNECTED') {
            logger.info(`✅ Reconnected ${accountConfig.brokerName} successfully`);
            this.initialized = true;
          }
        } catch (err: any) {
          accountConfig.status = 'FAILED';
          logger.error(`❌ Reconnect attempt failed for ${accountConfig.brokerName}: ${err.message}`);
        }
      }
    }, 60_000); // check every 60 seconds
  }

  /**
   * Initialize all accounts
   */
  async initialize(): Promise<void> {
    logger.info('🚀 Initializing Clean Multi-Account Executor...');

    const accountsConfig = process.env.METAAPI_ACCOUNTS;
    if (!accountsConfig) {
      throw new Error('METAAPI_ACCOUNTS environment variable is required');
    }

    // Parse per-account risk overrides, e.g. ACCOUNT_RISK_OVERRIDES={"<accountId>":{"useFixedLotSize":true,"fixedLotSize":0.2}}
    let riskOverridesById: Record<string, AccountRiskOverrides> = {};
    const riskOverridesRaw = process.env.ACCOUNT_RISK_OVERRIDES;
    if (riskOverridesRaw) {
      try {
        riskOverridesById = JSON.parse(riskOverridesRaw);
      } catch (err: any) {
        logger.error(`❌ Failed to parse ACCOUNT_RISK_OVERRIDES JSON: ${err.message}`);
      }
    }

    // Parse account configurations
    const accountStrings = accountsConfig.split(',');
    for (const accountString of accountStrings) {
      const parts = accountString.trim().split(':');
      const id = parts[0];
      const brokerName = parts[1];
      const accountType = parts[2] || 'LIVE'; // default to LIVE if not specified
      const tokenEnvName = parts[3]; // optional: name of env var holding this account's own token

      if (!id || !brokerName) {
        logger.warn(`⚠️ Invalid account config (need at least id:brokerName): ${accountString}`);
        continue;
      }

      // Resolve the token for this account. A 4th field names an env var (e.g. METAAPI_TOKEN_2)
      // holding a token scoped to this account; without it, fall back to the default METAAPI_TOKEN.
      let token = this.defaultToken;
      if (tokenEnvName) {
        const accountToken = process.env[tokenEnvName.trim()];
        if (!accountToken) {
          logger.error(`❌ ${brokerName.trim()}: token env var "${tokenEnvName.trim()}" is empty or missing — skipping account`);
          continue;
        }
        token = accountToken.trim();
        logger.info(`🔑 ${brokerName.trim()} will use its own token from ${tokenEnvName.trim()}`);
      }

      const riskOverrides = riskOverridesById[id.trim()];
      if (riskOverrides) {
        logger.info(`⚙️ ${brokerName.trim()} has risk overrides: ${JSON.stringify(riskOverrides)}`);
      }

      const accountConfig: AccountConfig = {
        id: id.trim(),
        brokerName: brokerName.trim(),
        accountType: accountType.trim().toUpperCase() as 'DEMO' | 'LIVE',
        token,
        status: 'CONNECTING',
        symbolCache: new Map(),
        riskOverrides
      };

      this.accounts.set(accountConfig.id, accountConfig);
    }

    // Connect accounts sequentially with reduced delays for faster startup
    for (const [accountId, accountConfig] of this.accounts) {
      await this.connectAccount(accountConfig);
      
      // Reduced delay between connections (was 5s, now 2s)
      logger.info(`⏳ Waiting 2 seconds before next connection...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const connectedCount = Array.from(this.accounts.values())
      .filter(acc => acc.status === 'CONNECTED').length;
    
    this.initialized = connectedCount > 0;

    logger.info(`✅ Initialized ${connectedCount}/${this.accounts.size} accounts`);

    // Start background health monitor regardless of initial success
    this.startReconnectMonitor();
    logger.info('🩺 Background reconnect monitor started (60s interval)');
  }

  /**
   * Connect a single account following MetaAPI documentation with enhanced error handling
   */
  private async connectAccount(accountConfig: AccountConfig, retryCount: number = 0): Promise<void> {
    const maxRetries = 2; // Reduced from 3 to 2
    const retryDelay = 5000; // Reduced from 10s to 5s
    
    try {
      logger.info(`🔗 Connecting ${accountConfig.brokerName} (${accountConfig.accountType})... (Attempt ${retryCount + 1}/${maxRetries + 1})`);

      // Wrap in timeout to prevent hanging
      const connectionPromise = this.performConnection(accountConfig);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout after 60 seconds')), 60000);  // Reduced from 120s to 60s
      });

      await Promise.race([connectionPromise, timeoutPromise]);
      
    } catch (error: any) {
      accountConfig.status = 'FAILED';
      
      // Enhanced error logging
      const errorDetails = {
        message: error.message,
        name: error.name,
        statusCode: error.statusCode,
        details: error.details,
        attempt: retryCount + 1
      };
      
      // Log the full error so it's visible in PM2 / VPS logs
      logger.error(
        `❌ Failed to connect ${accountConfig.brokerName}: [${errorDetails.name}] ${errorDetails.message} | statusCode=${errorDetails.statusCode} | attempt=${errorDetails.attempt} | details=${JSON.stringify(errorDetails.details)}`
      );
      
      // Retry logic for specific errors
      const shouldRetry = (
        (error.message?.includes('timeout') || 
         error.message?.includes('ETIMEDOUT') ||
         error.message?.includes('ECONNRESET') ||
         error.statusCode === 503 ||
         error.statusCode === 502) && 
        retryCount < maxRetries
      );
      
      if (shouldRetry) {
        logger.warn(`🔄 Retrying ${accountConfig.brokerName} connection in ${retryDelay/1000} seconds... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.connectAccount(accountConfig, retryCount + 1);
      }
      
      // Check if it's a timeout error
      if (error.message?.includes('timeout') || error.message?.includes('TimeoutError')) {
        logger.warn(`⏰ ${accountConfig.brokerName} connection timed out - this may resolve on retry`);
      }
      
      // Check if it's a region/connection issue
      if (error.message?.includes('region') || error.message?.includes('not connected to broker')) {
        logger.warn(`🌍 ${accountConfig.brokerName} may have region connectivity issues`);
      }
      
      // Clean up failed connection
      if (accountConfig.connection) {
        try {
          await accountConfig.connection.close();
        } catch (closeError) {
          // Ignore cleanup errors
        }
        accountConfig.connection = undefined;
      }
    }
  }

  /**
   * Perform the actual connection process following MetaAPI best practices
   */
  private async performConnection(accountConfig: AccountConfig): Promise<void> {
      // Get account (standard MetaAPI pattern) using this account's own token
      const api = this.getApi(accountConfig.token);
      accountConfig.account = await api.metatraderAccountApi.getAccount(accountConfig.id);
      
      // Deploy if needed (standard pattern)
      if (accountConfig.account.state !== 'DEPLOYED') {
        logger.info(`📦 Deploying ${accountConfig.brokerName}...`);
        await accountConfig.account.deploy();
        await accountConfig.account.waitDeployed(30000);  // Reduced from 60s to 30s
      }

      // Wait for connection (standard pattern)
      logger.info(`⏳ Waiting for ${accountConfig.brokerName} connection...`);
      await accountConfig.account.waitConnected(45000);  // Reduced from 90s to 45s
      logger.info(`🔗 ${accountConfig.brokerName} account connected`);

      // Get RPC connection — v29 API: getRPCConnection() is synchronous, then connect() async
      logger.info(`📡 Establishing RPC connection for ${accountConfig.brokerName}...`);
      accountConfig.connection = accountConfig.account.getRPCConnection();
      await accountConfig.connection.connect();
      logger.info(`✅ ${accountConfig.brokerName} RPC connected`);
      
      // Wait for synchronization (critical step)
      logger.info(`🔄 Synchronizing ${accountConfig.brokerName}...`);
      try {
        await accountConfig.connection.waitSynchronized();
        logger.info(`✅ ${accountConfig.brokerName} synchronized`);
        
        accountConfig.status = 'CONNECTED';
        logger.info(`🎉 ${accountConfig.brokerName} fully connected and ready for trading!`);
      } catch (syncError: any) {
        logger.warn(`⚠️ ${accountConfig.brokerName} synchronization failed: ${syncError.message}`);
        // For RPC connections, synchronization failure doesn't mean unusable
        accountConfig.status = 'CONNECTED'; 
        logger.info(`🔗 ${accountConfig.brokerName} RPC connected (synchronization pending)`);
      }
  }

  /**
   * Execute trade signal across all connected accounts
   */
  async executeTradeSignal(signal: TradeSignal): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    ticket?: string;
    volume?: number;
    signalId?: string;
  }> {
    if (!this.initialized) {
      return {
        success: false,
        error: 'Executor not initialized'
      };
    }

    logger.info('🚀 Executing trade signal:', {
      symbol: signal.symbol,
      action: signal.action,
      entryZone: signal.entryZone
    });

    // Centralized pre-trade guard — runs for EVERY path (text, image, manual,
    // dashboard API) since they all funnel through here. Blocks duplicates,
    // daily-limit breaches, and structurally inverted signals before any order.
    const decision = this.guard.check(signal);
    if (!decision.allowed) {
      logger.warn(`🛑 Trade blocked by pre-trade guard: ${decision.reason}`);
      return {
        success: false,
        error: `Blocked: ${decision.reason}`,
        message: `Blocked by pre-trade guard: ${decision.reason}`
      };
    }

    const results: TradeExecutionResult[] = [];
    const connectedAccounts = Array.from(this.accounts.values())
      .filter(acc => acc.status === 'CONNECTED');

    if (connectedAccounts.length === 0) {
      return {
        success: false,
        error: 'No connected accounts available'
      };
    }

    // Execute on each account sequentially
    for (const accountConfig of connectedAccounts) {
      const result = await this.executeOnAccount(signal, accountConfig);
      results.push(result);

      // Delay between executions to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const successCount = results.filter(r => r.success).length;
    const totalAccounts = results.length;
    const firstSuccess = results.find(r => r.success);

    // Count the signal once (not per account) against the daily trade limit.
    if (successCount > 0) {
      this.guard.recordExecuted();
    }

    return {
      success: successCount > 0,
      message: `Executed on ${successCount}/${totalAccounts} accounts`,
      ticket: firstSuccess?.ticket,
      volume: firstSuccess?.volume,
      signalId: `multi-${Date.now()}`
    };
  }

  /**
   * Target risk in account USD: dashboard RISK_AMOUNT_USD, else FIXED_RISK_AMOUNT, else balance * RISK_PERCENTAGE.
   */
  private getEffectiveRiskUsd(connection: any): number {
    const dashFixed = process.env.RISK_AMOUNT_USD;
    if (dashFixed != null && dashFixed !== '') {
      const v = parseFloat(dashFixed);
      if (isFinite(v) && v > 0) return v;
    }
    const fixedEnv = parseFloat(process.env.FIXED_RISK_AMOUNT || '');
    if (isFinite(fixedEnv) && fixedEnv > 0) return fixedEnv;
    const pct = parseFloat(process.env.RISK_PERCENTAGE || '0.33');
    try {
      const bal = connection?.terminalState?.accountInformation?.balance;
      if (typeof bal === 'number' && bal > 0 && isFinite(pct)) {
        return bal * (pct / 100);
      }
    } catch {
      /* ignore */
    }
    return parseFloat(process.env.FIXED_RISK_AMOUNT || '900');
  }

  /** Lot size for risk-distance math: per-account override, else FIXED_LOT_SIZE env, else config default. */
  private getEffectiveLotSize(accountConfig?: AccountConfig): number {
    const override = accountConfig?.riskOverrides?.fixedLotSize;
    if (typeof override === 'number' && isFinite(override) && override > 0) return override;
    const fromEnv = parseFloat(process.env.FIXED_LOT_SIZE || '');
    if (isFinite(fromEnv) && fromEnv > 0) return fromEnv;
    return config.trading.fixedLotSize;
  }

  /**
   * SL/TP from user-facing risk settings (same helpers as parser fallback).
   * Channel TP/SL lines are ignored when USE_SIGNAL_STOPS is not true.
   */
  private applyUserRiskLevels(
    signal: TradeSignal,
    entryPrice: number,
    connection: any,
    accountConfig?: AccountConfig
  ): { stopLoss: number; takeProfit: number } {
    const lotSize = this.getEffectiveLotSize(accountConfig);
    const riskAmount = this.getEffectiveRiskUsd(connection);
    const riskRewardRatio = parseFloat(process.env.RISK_REWARD_RATIO || '1.5');

    const { stopLoss, targets } = calculateFixedDollarStopsAndTargets({
      symbol: signal.symbol,
      entryPrice,
      direction: signal.action,
      config: { lotSize, riskAmount, riskRewardRatio }
    });
    const slDistance = Math.abs(entryPrice - stopLoss);
    const fallbackTp =
      signal.action === 'BUY'
        ? entryPrice + slDistance * riskRewardRatio
        : entryPrice - slDistance * riskRewardRatio;
    const tp = targets[0] ?? fallbackTp;

    return {
      stopLoss: formatPriceForInstrument(stopLoss, signal.symbol),
      takeProfit: formatPriceForInstrument(tp, signal.symbol)
    };
  }

  /**
   * Resolve canonical symbol (e.g. "NAS100") to the exact name the broker uses.
   * Tries a static alias list first (no network), then verifies via getSymbolPrice.
   * Results are cached per account so each symbol is only looked up once.
   */
  private async resolveSymbol(canonical: string, accountConfig: AccountConfig): Promise<string> {
    const upper = canonical.toUpperCase();

    // Return cached result immediately
    if (accountConfig.symbolCache.has(upper)) {
      return accountConfig.symbolCache.get(upper)!;
    }

    // Static alias candidates — ordered by likeliness (exact match first, then common broker variants)
    const ALIASES: Record<string, string[]> = {

      // ── Metals ──────────────────────────────────────────────────────────────
      'XAUUSD':  ['XAUUSD', 'GOLD', 'XAUUSDm', 'XAUUSD.x', 'XAU/USD', 'XAUUSD.'],
      'XAGUSD':  ['XAGUSD', 'SILVER', 'XAGUSDm', 'XAGUSD.x', 'XAG/USD'],
      'XPTUSD':  ['XPTUSD', 'PLATINUM', 'XPT/USD'],
      'XPDUSD':  ['XPDUSD', 'PALLADIUM', 'XPD/USD'],

      // ── Forex majors ────────────────────────────────────────────────────────
      'EURUSD':  ['EURUSD', 'EURUSDm', 'EURUSD.x', 'EUR/USD', 'EURUSD.sim'],
      'GBPUSD':  ['GBPUSD', 'GBPUSDm', 'GBPUSD.x', 'GBP/USD', 'GBPUSD.sim'],
      'USDJPY':  ['USDJPY', 'USDJPYm', 'USDJPY.x', 'USD/JPY', 'USDJPY.sim'],
      'USDCHF':  ['USDCHF', 'USDCHFm', 'USDCHF.x', 'USD/CHF', 'USDCHF.sim'],
      'AUDUSD':  ['AUDUSD', 'AUDUSDm', 'AUDUSD.x', 'AUD/USD', 'AUDUSD.sim'],
      'USDCAD':  ['USDCAD', 'USDCADm', 'USDCAD.x', 'USD/CAD', 'USDCAD.sim'],
      'NZDUSD':  ['NZDUSD', 'NZDUSDm', 'NZDUSD.x', 'NZD/USD', 'NZDUSD.sim'],

      // ── Forex crosses ───────────────────────────────────────────────────────
      'EURJPY':  ['EURJPY', 'EURJPYm', 'EUR/JPY', 'EURJPY.sim'],
      'EURGBP':  ['EURGBP', 'EURGBPm', 'EUR/GBP', 'EURGBP.sim'],
      'EURAUD':  ['EURAUD', 'EURAUDm', 'EUR/AUD', 'EURAUD.sim'],
      'EURCAD':  ['EURCAD', 'EURCADm', 'EUR/CAD', 'EURCAD.sim'],
      'EURCHF':  ['EURCHF', 'EURCHFm', 'EUR/CHF', 'EURCHF.sim'],
      'EURNZD':  ['EURNZD', 'EURNZDm', 'EUR/NZD', 'EURNZD.sim'],
      'GBPJPY':  ['GBPJPY', 'GBPJPYm', 'GBP/JPY', 'GBPJPY.sim'],
      'GBPAUD':  ['GBPAUD', 'GBPAUDm', 'GBP/AUD', 'GBPAUD.sim'],
      'GBPCAD':  ['GBPCAD', 'GBPCADm', 'GBP/CAD', 'GBPCAD.sim'],
      'GBPCHF':  ['GBPCHF', 'GBPCHFm', 'GBP/CHF', 'GBPCHF.sim'],
      'GBPNZD':  ['GBPNZD', 'GBPNZDm', 'GBP/NZD', 'GBPNZD.sim'],
      'AUDJPY':  ['AUDJPY', 'AUDJPYm', 'AUD/JPY', 'AUDJPY.sim'],
      'AUDCAD':  ['AUDCAD', 'AUDCADm', 'AUD/CAD', 'AUDCAD.sim'],
      'AUDCHF':  ['AUDCHF', 'AUDCHFm', 'AUD/CHF', 'AUDCHF.sim'],
      'AUDNZD':  ['AUDNZD', 'AUDNZDm', 'AUD/NZD', 'AUDNZD.sim'],
      'CADJPY':  ['CADJPY', 'CADJPYm', 'CAD/JPY', 'CADJPY.sim'],
      'CADCHF':  ['CADCHF', 'CADCHFm', 'CAD/CHF', 'CADCHF.sim'],
      'CHFJPY':  ['CHFJPY', 'CHFJPYm', 'CHF/JPY', 'CHFJPY.sim'],
      'NZDJPY':  ['NZDJPY', 'NZDJPYm', 'NZD/JPY', 'NZDJPY.sim'],
      'NZDCAD':  ['NZDCAD', 'NZDCADm', 'NZD/CAD', 'NZDCAD.sim'],
      'NZDCHF':  ['NZDCHF', 'NZDCHFm', 'NZD/CHF', 'NZDCHF.sim'],

      // ── US Indices (FTMO: *.cash | FTMO-US: *.sim) ──────────────────────────
      'US30':    ['US30.cash', 'US30', 'DJ30', 'DOWJONES', 'US30m', 'DJI', 'DOW30', 'US30.sim'],
      'NAS100':  ['US100.cash', 'NAS100', 'USTEC', 'NAS100.cash', 'US100', 'NAS100m', 'NDX', 'NASDAQ100', 'US100.sim'],
      'NQ':      ['US100.cash', 'NAS100', 'NQ', 'USTEC', 'NAS100.cash', 'US100', 'NAS100m', 'NDX', 'NASDAQ100', 'US100.sim'],
      'SPX500':  ['US500.cash', 'SPX500', 'US500', 'SPX500.cash', 'SP500', 'SPX', 'US500m', 'US500.sim'],
      'US2000':  ['US2000.cash', 'US2000', 'RUSSELL2000', 'RUT', 'US2000.sim'],

      // ── European Indices (FTMO: *.cash) ─────────────────────────────────────
      'UK100':   ['UK100.cash', 'UK100', 'FTSE100', 'FTSE', 'UKXm', 'UK100.sim'],
      'GER30':   ['GER40.cash', 'GER30.cash', 'GER40', 'GER30', 'DE40', 'DE30', 'DAX40', 'DAX', 'GER40.sim'],
      'GER40':   ['GER40.cash', 'GER40', 'GER30.cash', 'GER30', 'DE40', 'DE30', 'DAX40', 'DAX', 'GER40.sim'],
      'FRA40':   ['FRA40.cash', 'FRA40', 'CAC40', 'CAC', 'F40EUR', 'FRA40.sim'],
      'EU50':    ['EU50.cash', 'EU50', 'STOXX50', 'EUSTX50', 'SX5E', 'ESXEUR', 'EU50.sim'],
      'ESP35':   ['SPN35.cash', 'ESP35.cash', 'ESP35', 'SPN35', 'IBEX35', 'ESP35.sim'],
      'SWI20':   ['SWI20.cash', 'SWI20', 'SMI', 'SWI20.sim'],
      'NED25':   ['N25.cash', 'NED25', 'AEX25', 'NED25.sim'],

      // ── Asian / Pacific Indices (FTMO: *.cash) ──────────────────────────────
      'JPN225':  ['JP225.cash', 'JPN225.cash', 'JPN225', 'JP225', 'NIKKEI', 'NIK', 'N225', 'JPN225.sim'],
      'AUS200':  ['AUS200.cash', 'AUS200', 'AU200', 'ASX200', 'AUS200.sim'],
      'HK50':    ['HK50.cash', 'HK50', 'HANGSENG', 'HSI', 'HSIHED', 'HK50.sim'],
      'CHINAH':  ['CHINAH.cash', 'CHINAH', 'CHINA50'],

      // ── Commodities — Energy (FTMO: *.cash) ─────────────────────────────────
      'USOIL':   ['USOIL.cash', 'USOIL', 'WTI', 'OIL', 'CL', 'CRUDEOIL'],
      'UKOIL':   ['UKOIL.cash', 'UKOIL', 'BRENT', 'BRENTOIL'],
      'NGAS':    ['NATGAS.cash', 'NGAS', 'NATURALGAS', 'NG', 'NATGAS'],

      // ── Commodities — Agricultural ──────────────────────────────────────────
      'WHEAT':   ['WHEAT', 'WEAT', 'ZW'],
      'CORN':    ['CORN', 'ZC'],
      'SOYBEAN': ['SOYBEAN', 'SOYA', 'ZS'],
      'COFFEE':  ['COFFEE.c', 'COFFEE', 'KC'],
      'SUGAR':   ['SUGAR.c', 'SUGAR', 'SB'],
      'COCOA':   ['COCOA.c', 'COCOA'],
      'COTTON':  ['COTTON', 'CT'],

      // ── Crypto ──────────────────────────────────────────────────────────────
      'BTCUSD':  ['BTCUSD', 'BITCOIN', 'BTCUSDm', 'BTC/USD', 'BTCUSDT', 'XBTUSD'],
      'ETHUSD':  ['ETHUSD', 'ETHEREUM', 'ETHUSDm', 'ETH/USD', 'ETHUSDT'],
      'LTCUSD':  ['LTCUSD', 'LITECOIN', 'LTC/USD'],
      'XRPUSD':  ['XRPUSD', 'RIPPLE', 'XRP/USD'],
      'BNBUSD':  ['BNBUSD', 'BNB/USD'],
      'SOLUSD':  ['SOLUSD', 'SOLANA', 'SOL/USD'],
      'ADAUSD':  ['ADAUSD', 'CARDANO', 'ADA/USD'],
      'DOTUSD':  ['DOTUSD', 'POLKADOT', 'DOT/USD'],
      'DOGEUSD': ['DOGEUSD', 'DOGE/USD'],
      'LINKUSD': ['LINKUSD', 'LINK/USD'],

      // ── Deriv Volatility Index (Synthetic Indices) ──────────────────────────
      'V10':     ['V10', 'Volatility 10 Index', 'Vol. 10 Index', '1HZ10V'],
      'V25':     ['V25', 'Volatility 25 Index', 'Vol. 25 Index', '1HZ25V'],
      'V50':     ['V50', 'Volatility 50 Index', 'Vol. 50 Index', '1HZ50V'],
      'V75':     ['V75', 'Volatility 75 Index', 'Vol. 75 Index', '1HZ75V', 'R_75'],
      'V100':    ['V100', 'Volatility 100 Index', 'Vol. 100 Index', '1HZ100V', 'R_100'],
      'V10S':    ['V10S', 'Volatility 10 (1s) Index', 'Vol. 10 (1s) Index'],
      'V25S':    ['V25S', 'Volatility 25 (1s) Index', 'Vol. 25 (1s) Index'],
      'V50S':    ['V50S', 'Volatility 50 (1s) Index', 'Vol. 50 (1s) Index'],
      'V75S':    ['V75S', 'Volatility 75 (1s) Index', 'Vol. 75 (1s) Index'],
      'V100S':   ['V100S', 'Volatility 100 (1s) Index', 'Vol. 100 (1s) Index'],
      'V150S':   ['V150S', 'Volatility 150 (1s) Index', 'Vol. 150 (1s) Index'],
      'V200S':   ['V200S', 'Volatility 200 (1s) Index', 'Vol. 200 (1s) Index'],
      'V250S':   ['V250S', 'Volatility 250 (1s) Index', 'Vol. 250 (1s) Index'],

      // ── Deriv Crash & Boom ───────────────────────────────────────────────────
      'CRASH300':  ['CRASH300', 'Crash 300 Index'],
      'CRASH500':  ['CRASH500', 'Crash 500 Index', 'CRASH500'],
      'CRASH1000': ['CRASH1000', 'Crash 1000 Index', 'CRASH1000'],
      'BOOM300':   ['BOOM300', 'Boom 300 Index'],
      'BOOM500':   ['BOOM500', 'Boom 500 Index', 'BOOM500'],
      'BOOM1000':  ['BOOM1000', 'Boom 1000 Index', 'BOOM1000'],

      // ── Deriv Step / Range / Bear-Bull ───────────────────────────────────────
      'STPIDX':  ['STPIDX', 'Step Index', 'STP_IDX'],
      'RANIDX':  ['RANIDX', 'Range Break 100 Index', 'RB100V', 'Range Break 200 Index'],
      'BERIDX':  ['BERIDX', 'Bear Market Index'],
      'BULIDX':  ['BULIDX', 'Bull Market Index'],

      // ── Deriv Jump Indices ───────────────────────────────────────────────────
      'JUMP10':  ['JUMP10', 'Jump 10 Index'],
      'JUMP25':  ['JUMP25', 'Jump 25 Index'],
      'JUMP50':  ['JUMP50', 'Jump 50 Index'],
      'JUMP75':  ['JUMP75', 'Jump 75 Index'],
      'JUMP100': ['JUMP100', 'Jump 100 Index'],

      // ── US Bonds / Rates ─────────────────────────────────────────────────────
      'US10Y':   ['US10Y', 'TNX', 'TNOTE', 'US10YR'],
      'US2Y':    ['US2Y', 'US2YR'],
      'GER10Y':  ['GER10Y', 'BUND'],
    };

    const candidates: string[] = ALIASES[upper] ?? [upper, upper + '.x', upper + 'm'];

    for (const candidate of candidates) {
      try {
        await accountConfig.connection!.getSymbolPrice(candidate, false);
        if (candidate !== canonical) {
          logger.info(`🔄 Symbol mapping: ${canonical} → ${candidate} on ${accountConfig.brokerName}`);
        }
        accountConfig.symbolCache.set(upper, candidate);
        return candidate;
      } catch {
        // not available under this name, try next
      }
    }

    logger.warn(`⚠️ No broker match for ${canonical} on ${accountConfig.brokerName} — tried: ${candidates.join(', ')}`);
    accountConfig.symbolCache.set(upper, canonical); // cache the miss so we don't retry every trade
    return canonical;
  }

  /**
   * Get broker-specific minimum stop distance in points
   */
  private getBrokerMinimumStopDistance(symbol: string, brokerName: string): number {
    const upperSymbol = symbol.toUpperCase();
    
    // General broker defaults
    if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      return 30; // 30 points minimum for Gold
    }
    if (upperSymbol.includes('JPY')) {
      return 20; // 2 pips minimum for JPY pairs
    }
    return 20; // Default 20 points
  }

  /**
   * Execute trade on a single account
   */
  private async executeOnAccount(
    signal: TradeSignal,
    accountConfig: AccountConfig
  ): Promise<TradeExecutionResult> {
    try {
      logger.info(`💼 Executing on ${accountConfig.brokerName}...`);

      if (!accountConfig.connection) {
        throw new Error('Connection not available');
      }

      // Step 1: Resolve canonical symbol → broker symbol
      const validSymbol = await this.resolveSymbol(signal.symbol, accountConfig);

      // Step 2: Get market data from connection
      const price = await accountConfig.connection.getSymbolPrice(validSymbol, false);
      const marketData = { bid: price?.bid || 0, ask: price?.ask || 0 };

      // Step 3: Entry price from signal. SL/TP: signal values take priority;
      // user risk config is only the fallback when the signal provides none.
      const entryPrice = this.calculateEntryPrice(signal, marketData);
      const rr = parseFloat(process.env.RISK_REWARD_RATIO || '1.5');
      let finalTakeProfit: number;

      const hasSignalSL = typeof signal.stopLoss === 'number' && signal.stopLoss > 0;
      const hasSignalTP = Array.isArray(signal.targets) && signal.targets.length > 0;

      if (hasSignalSL && hasSignalTP) {
        // Signal provides both SL and TP — always use them
        signal.stopLoss = formatPriceForInstrument(signal.stopLoss, signal.symbol);
        finalTakeProfit = formatPriceForInstrument(signal.targets[0], signal.symbol);
        logger.info(`📌 SL: ${signal.stopLoss} | TP: ${finalTakeProfit} (from signal)`);
        if (signal.targets.length > 1) {
          logger.info(`📌 Additional signal targets: ${signal.targets.slice(1).join(', ')}`);
        }
      } else if (hasSignalSL && !hasSignalTP) {
        // Signal has SL but no TP — use signal SL, derive TP from RR
        signal.stopLoss = formatPriceForInstrument(signal.stopLoss, signal.symbol);
        const slDistance = Math.abs(entryPrice - signal.stopLoss);
        finalTakeProfit = signal.action === 'BUY'
          ? formatPriceForInstrument(entryPrice + slDistance * rr, signal.symbol)
          : formatPriceForInstrument(entryPrice - slDistance * rr, signal.symbol);
        logger.info(`📌 SL: ${signal.stopLoss} (signal) | TP: ${finalTakeProfit} (derived at ${rr}R)`);
      } else {
        // Signal has no SL/TP — fall back to user risk config
        logger.warn('⚠️ Signal missing SL/TP — falling back to user risk config');
        const levels = this.applyUserRiskLevels(signal, entryPrice, accountConfig.connection, accountConfig);
        signal.stopLoss = levels.stopLoss;
        finalTakeProfit = levels.takeProfit;
        logger.info(`📌 SL: ${signal.stopLoss} | TP: ${finalTakeProfit} (user risk config)`);
      }

      const volume = this.calculateVolume(accountConfig.connection, signal, entryPrice, validSymbol, accountConfig);

      // Step 3.6: Validate and adjust stops for broker minimum distance (preserve RR on TP).
      // getBrokerMinimumStopDistance returns a value in POINTS — convert to price distance
      // using pipSize before comparing or applying, otherwise forex pairs like NZDUSD (pipSize
      // 0.0001) would be compared against a raw "20" and produce a negative stop loss.
      const brokerName = accountConfig.brokerName;
      const minStopPoints = this.getBrokerMinimumStopDistance(validSymbol, brokerName);
      const symPipSize = getPipSize(validSymbol);
      const minStopPrice = minStopPoints * symPipSize;

      const currentStopDistance = Math.abs(entryPrice - signal.stopLoss);
      if (currentStopDistance < minStopPrice) {
        logger.warn(
          `⚠️ Stop distance ${currentStopDistance.toFixed(5)} < broker minimum ${minStopPrice.toFixed(5)} (${minStopPoints} pts) — widening SL`
        );

        if (signal.action === 'BUY') {
          signal.stopLoss = entryPrice - minStopPrice;
          // Only recompute TP when the signal did not supply one — preserve explicit TP targets.
          if (!hasSignalTP) finalTakeProfit = entryPrice + minStopPrice * rr;
        } else {
          signal.stopLoss = entryPrice + minStopPrice;
          if (!hasSignalTP) finalTakeProfit = entryPrice - minStopPrice * rr;
        }

        signal.stopLoss = formatPriceForInstrument(signal.stopLoss, signal.symbol);
        finalTakeProfit = formatPriceForInstrument(finalTakeProfit, signal.symbol);

        logger.info(
          `✅ Adjusted to broker minimum — SL: ${signal.stopLoss}, TP: ${finalTakeProfit}${hasSignalTP ? ' (signal TP preserved)' : ` (RR ${rr})`}`
        );
      }

      // Guard: TP must not equal entry — that produces a zero-profit trade and likely
      // indicates the parser mistook a TP level for the entry price.
      const tpToEntryDistance = Math.abs(finalTakeProfit - entryPrice);
      if (tpToEntryDistance < entryPrice * 0.001) {
        throw new Error(
          `TP (${finalTakeProfit}) is within 0.1% of entry (${entryPrice}) — ` +
          `likely a signal parsing error. Aborting to prevent zero-profit trade.`
        );
      }

      // Step 4: Place the order.
      // MARKET signals (e.g. "Buy Now" without a specific price) execute immediately.
      // Everything else uses a pending order: LIMIT if signal is on the correct side of
      // the market, STOP if we need to wait for price to break through first.
      //   BUY  + signal below market  → BUY LIMIT
      //   BUY  + signal above market  → BUY STOP
      //   SELL + signal above market  → SELL LIMIT
      //   SELL + signal below market  → SELL STOP
      let result;
      const tradeOptions = { comment: 'Bot Trade' };
      const currentMid = (marketData.bid + marketData.ask) / 2;

      if (signal.orderType === 'MARKET') {
        if (signal.action === 'BUY') {
          logger.info(`📋 BUY MARKET (signal: "Buy Now") SL: ${signal.stopLoss} TP: ${finalTakeProfit}`);
          result = await accountConfig.connection.createMarketBuyOrder(
            validSymbol, volume, signal.stopLoss, finalTakeProfit, tradeOptions
          );
        } else {
          logger.info(`📋 SELL MARKET (signal: "Sell Now") SL: ${signal.stopLoss} TP: ${finalTakeProfit}`);
          result = await accountConfig.connection.createMarketSellOrder(
            validSymbol, volume, signal.stopLoss, finalTakeProfit, tradeOptions
          );
        }
      } else if (signal.action === 'BUY') {
        if (entryPrice <= currentMid) {
          logger.info(`📋 BUY LIMIT @ ${entryPrice} (market ${currentMid})`);
          result = await accountConfig.connection.createLimitBuyOrder(
            validSymbol, volume, entryPrice, signal.stopLoss, finalTakeProfit, tradeOptions
          );
        } else {
          logger.info(`📋 BUY STOP @ ${entryPrice} (market ${currentMid})`);
          result = await accountConfig.connection.createStopBuyOrder(
            validSymbol, volume, entryPrice, signal.stopLoss, finalTakeProfit, tradeOptions
          );
        }
      } else if (signal.action === 'SELL') {
        if (entryPrice >= currentMid) {
          logger.info(`📋 SELL LIMIT @ ${entryPrice} (market ${currentMid})`);
          result = await accountConfig.connection.createLimitSellOrder(
            validSymbol, volume, entryPrice, signal.stopLoss, finalTakeProfit, tradeOptions
          );
        } else {
          logger.info(`📋 SELL STOP @ ${entryPrice} (market ${currentMid})`);
          result = await accountConfig.connection.createStopSellOrder(
            validSymbol, volume, entryPrice, signal.stopLoss, finalTakeProfit, tradeOptions
          );
        }
      } else {
        throw new Error(`Unsupported action: ${signal.action}`);
      }

      const ticket = result.positionId || result.orderId || 'Unknown';
      
      logger.info(`✅ Trade executed on ${accountConfig.brokerName}: ${ticket}`);

      return {
        accountId: accountConfig.id,
        brokerName: accountConfig.brokerName,
        success: true,
        message: `Trade executed successfully`,
        ticket,
        volume
      };

    } catch (error: any) {
      logger.error(`❌ Trade failed on ${accountConfig.brokerName}:`);
      logger.error(`❌ Error message: ${error.message}`);
      logger.error(`❌ Error details: ${JSON.stringify(error.details || {}, null, 2)}`);
      logger.error(`❌ Error code: ${error.stringCode || 'N/A'}`);
      logger.error(`❌ Full error:`, error);
      
      return {
        accountId: accountConfig.id,
        brokerName: accountConfig.brokerName,
        success: false,
        message: 'Trade execution failed',
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * Return the signal's entry price as-is. Pending order type (LIMIT vs STOP)
   * is chosen later based on direction vs current market — we never override the signal price.
   */
  private calculateEntryPrice(signal: TradeSignal, marketData: { bid: number; ask: number }): number {
    const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
    const currentMid = (marketData.bid + marketData.ask) / 2;
    logger.info(`📊 Signal entry: ${entryPrice} | Market: ${currentMid}`);
    return entryPrice;
  }

  /** MAX_TRADE_SIZE env override, else config default — the hard safety ceiling on volume. */
  private getMaxTradeSize(): number {
    const maxTradeCap = parseFloat(process.env.MAX_TRADE_SIZE || '');
    return isFinite(maxTradeCap) && maxTradeCap > 0 ? maxTradeCap : config.trading.maxTradeSize;
  }

  /**
   * Snap a volume to the broker's volume step (when the spec is available) and clamp it
   * to [brokerMin, min(brokerMax, MAX_TRADE_SIZE)]. Falls back to a 0.01 grid + 0.01 floor
   * when no broker spec is available (RPC connection or symbol not yet synced).
   */
  private clampVolume(volume: number, spec: ReturnType<typeof getBrokerSymbolSpec>, maxVol: number): number {
    if (spec) {
      return normalizeVolume(volume, {
        minVolume: spec.minVolume,
        maxVolume: Math.min(spec.maxVolume, maxVol),
        volumeStep: spec.volumeStep
      });
    }
    const clamped = Math.max(0.01, Math.min(volume, maxVol));
    return Math.round(clamped * 100) / 100;
  }

  /**
   * Volume sized to approximate target risk USD given entry→SL distance.
   *
   * Sizing source priority:
   *   1. Broker symbol specification (tickSize × tickValue) — authoritative, handles
   *      crypto/indices/metals correctly per the actual contract.
   *   2. riskMath heuristic pip model — fallback when the spec isn't available.
   * Volume is always snapped to the broker's volumeStep and clamped to its min/max
   * and the MAX_TRADE_SIZE safety ceiling.
   */
  private calculateVolume(
    connection: any,
    signal: TradeSignal,
    entryPrice: number,
    brokerSymbol: string,
    accountConfig?: AccountConfig
  ): number {
    const spec = getBrokerSymbolSpec(connection, brokerSymbol);
    const maxVol = this.getMaxTradeSize();

    // Fixed-lot mode: trade exactly the user-set FIXED_LOT_SIZE (or per-account override),
    // ignoring risk/balance. Still snapped to the broker volume step and MAX_TRADE_SIZE.
    const useFixedLotSize =
      accountConfig?.riskOverrides?.useFixedLotSize ??
      (process.env.USE_FIXED_LOT_SIZE || '').toLowerCase() === 'true';
    if (useFixedLotSize) {
      const fixed = this.getEffectiveLotSize(accountConfig);
      const lot = this.clampVolume(fixed, spec, maxVol);
      logger.info(`📦 Fixed-lot mode: trading ${lot} lots (FIXED_LOT_SIZE=${fixed}) — ignores balance/risk`);
      return lot;
    }

    try {
      const accountInfo = connection.terminalState?.accountInformation;
      const balance = accountInfo?.balance || 0;

      const fixedRiskAmount = this.getEffectiveRiskUsd(connection);

      let riskDistance = 0;
      if (signal.stopLoss && entryPrice) {
        riskDistance = Math.abs(entryPrice - signal.stopLoss);
      }

      if (!entryPrice || !signal.stopLoss || riskDistance === 0) {
        logger.warn('⚠️ Invalid entry/stop for volume — using configured lot size');
        return this.clampVolume(this.getEffectiveLotSize(accountConfig), spec, maxVol);
      }

      // Money risk per 1.0 lot for this stop distance.
      let moneyRiskPerLot: number;
      if (spec && isFinite(spec.tickValue) && spec.tickValue > 0) {
        // Broker-accurate: ticks of adverse movement × value per tick per lot.
        moneyRiskPerLot = (riskDistance / spec.tickSize) * spec.tickValue;
        logger.info(
          `   📐 Sizing via broker spec: tickSize=${spec.tickSize}, tickValue=$${spec.tickValue}, ` +
          `risk/lot=$${moneyRiskPerLot.toFixed(2)}`
        );
      } else {
        // Heuristic fallback (now crypto-aware in riskMath).
        const sym = signal.symbol.toUpperCase();
        const pipSize = getPipSize(sym);
        const pipValuePerLot = getPipValuePerLot(sym);
        moneyRiskPerLot = (riskDistance / pipSize) * pipValuePerLot;
        logger.info(
          `   📐 Sizing via heuristic pip model (broker spec unavailable): ` +
          `pipSize=${pipSize}, pipValue=$${pipValuePerLot}, risk/lot=$${moneyRiskPerLot.toFixed(2)}`
        );
      }

      if (!isFinite(moneyRiskPerLot) || moneyRiskPerLot <= 0) {
        return this.clampVolume(this.getEffectiveLotSize(accountConfig), spec, maxVol);
      }

      const rawLotSize = fixedRiskAmount / moneyRiskPerLot;
      if (rawLotSize > maxVol) {
        logger.warn(`⚠️ Lot size ${rawLotSize.toFixed(2)} capped to MAX_TRADE_SIZE ${maxVol} — raise MAX_TRADE_SIZE if this is wrong`);
      }
      const calculatedLotSize = this.clampVolume(rawLotSize, spec, maxVol);

      const actualRisk = calculatedLotSize * moneyRiskPerLot;
      const actualRiskPercentage = balance > 0 ? (actualRisk / balance) * 100 : 0;

      logger.info(`💰 Risk-target volume (${signal.symbol}):`);
      logger.info(`   Target risk USD: $${fixedRiskAmount.toFixed(2)}`);
      logger.info(`   Entry: ${entryPrice}, SL: ${signal.stopLoss}, distance: ${riskDistance.toFixed(6)}`);
      logger.info(`   Lots: ${calculatedLotSize} (actual risk ~$${actualRisk.toFixed(2)}, ${actualRiskPercentage.toFixed(3)}% of balance)`);

      return calculatedLotSize;
    } catch (error) {
      logger.error('Volume calculation error:', error);
      return this.clampVolume(this.getEffectiveLotSize(accountConfig), spec, maxVol);
    }
  }

  /**
   * Check if executor is connected
   */
  async isConnected(): Promise<boolean> {
    const connectedCount = Array.from(this.accounts.values())
      .filter(acc => acc.status === 'CONNECTED').length;
    return connectedCount > 0;
  }

  /**
   * Close all connections
   */
  async closeConnection(): Promise<void> {
    logger.info('🔌 Closing all connections...');

    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    for (const [_, accountConfig] of this.accounts) {
      if (accountConfig.connection) {
        try {
          await accountConfig.connection.close();
        } catch (error) {
          logger.warn(`Error closing connection for ${accountConfig.brokerName}`);
        }
      }
    }

    this.accounts.clear();
    this.initialized = false;
  }

  /**
   * Get account statuses for monitoring
   */
  getAccountStatuses() {
    return Array.from(this.accounts.values()).map(acc => {
      let terminalConnected = false;
      let hasSpecifications = false;
      
      // For RPC connections, we can't access terminalState directly
      // We'll mark as connected if the connection exists and account is connected
      if (acc.connection && acc.status === 'CONNECTED') {
        terminalConnected = true;
        hasSpecifications = true; // Assume specs are available if connected
      }
      
      return {
        id: acc.id,
        brokerName: acc.brokerName,
        accountType: acc.accountType,
        status: acc.status,
        terminalConnected,
        hasSpecifications,
        tradingReady: acc.status === 'CONNECTED' && terminalConnected && hasSpecifications
      };
    });
  }

  /**
   * Get real account data for dashboard (balance, equity, positions, etc.)
   */
  async getAllAccountsData() {
    const accountStatuses = this.getAccountStatuses();
    
    return Promise.all(accountStatuses.map(async acc => {
      const accountConfig = this.accounts.get(acc.id);
      
      // If account is not connected or no connection, return basic info with zeros
      if (acc.status !== 'CONNECTED' || !accountConfig?.connection) {
        return {
          ...acc,
          balance: 0,
          equity: 0,
          freeMargin: 0,
          marginLevel: 0,
          positions: [],
          pendingOrders: [],
          lastUpdate: Date.now()
        };
      }
      
      try {
        // Get real account information from MetaAPI RPC connection
        const accountInfo = await accountConfig.connection.getAccountInformation() || {};
        const positions = await accountConfig.connection.getPositions() || [];

        // Pending orders (limit/stop) live separately from open positions on MT5.
        // Fetch defensively because not every connection implementation exposes them.
        let pendingOrders: any[] = [];
        try {
          if (typeof (accountConfig.connection as any).getOrders === 'function') {
            pendingOrders = await (accountConfig.connection as any).getOrders() || [];
          }
        } catch (ordersErr) {
          logger.warn(`Could not fetch pending orders for ${acc.brokerName}:`, ordersErr);
          pendingOrders = [];
        }
        
        // Extract real financial data
        const balance = accountInfo.balance || 0;
        const equity = accountInfo.equity || balance;
        const freeMargin = accountInfo.freeMargin || 0;
        const marginLevel = accountInfo.marginLevel || 0;
        
        // Format positions with essential info for dashboard
        const formattedPositions = positions.map((pos: any) => ({
          id: pos.id,
          accountId: acc.id,
          symbol: pos.symbol,
          type: pos.type,
          volume: pos.volume,
          openPrice: pos.openPrice,
          currentPrice: pos.currentPrice || pos.openPrice,
          profit: pos.profit || 0,
          swap: pos.swap || 0,
          commission: pos.commission || 0,
          openTime: pos.openTime
        }));

        const formattedOrders = pendingOrders.map((order: any) => ({
          id: order.id,
          symbol: order.symbol,
          type: order.type,
          volume: order.volume ?? order.currentVolume,
          openPrice: order.openPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          time: order.time,
          comment: order.comment,
          state: order.state,
          accountId: acc.id
        }));
        
        return {
          ...acc,
          balance: parseFloat(balance.toFixed(2)),
          equity: parseFloat(equity.toFixed(2)),
          freeMargin: parseFloat(freeMargin.toFixed(2)),
          marginLevel: parseFloat(marginLevel.toFixed(2)),
          positions: formattedPositions,
          pendingOrders: formattedOrders,
          lastUpdate: Date.now()
        };
        
      } catch (error) {
        logger.error(`Error getting account data for ${acc.brokerName}:`, error);
        return {
          ...acc,
          balance: 0,
          equity: 0,
          freeMargin: 0,
          marginLevel: 0,
          positions: [],
          pendingOrders: [],
          lastUpdate: Date.now(),
          error: 'Failed to fetch account data'
        };
      }
    }));
  }

  async closePosition(accountId: string, positionId: string) {
    const accountConfig = this.accounts.get(accountId);
    if (!accountConfig?.connection) {
      throw new Error(`Account ${accountId} not connected`);
    }
    
    try {
      // Simplified - try to close position using market order
      const positions = await accountConfig.connection.getPositions() || [];
      const position = positions.find((p: any) => p.id === positionId);
      
      if (!position) {
        throw new Error(`Position ${positionId} not found`);
      }
      
      // Close the position by its ID — the correct MetaAPI RPC call.
      // createMarketSellOrder/BuyOrder would open a new opposing position on hedging accounts.
      const result = await accountConfig.connection.closePosition(positionId);
      
      logger.info(`✅ Position ${positionId} closed on ${accountConfig.brokerName}`);
      return result;
    } catch (error) {
      logger.error(`❌ Failed to close position ${positionId}:`, error);
      throw error;
    }
  }

  async getTradeHistory() {
    // Simplified version - return empty for now
    return {
      deals: [],
      orders: [],
      positions: [],
      transactions: [],
      totalCount: 0,
      hasMore: false,
      summary: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalProfit: 0,
        winRate: 0
      }
    };
  }

  async getAccountPerformanceMetrics() {
    return null;
  }

  async getAllAccountsPerformanceMetrics() {
    return [];
  }
}
