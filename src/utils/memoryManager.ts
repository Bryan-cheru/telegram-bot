// Memory Management and Performance Optimization Fixes
// File: src/utils/memoryManager.ts

import { logger } from './logger';

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
}

export class MemoryManager {
  private static instance: MemoryManager;
  private readonly MAX_HEAP_SIZE_MB = 400; // For 512MB Render
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MEMORY_WARNING_THRESHOLD = 0.8; // 80%
  private readonly MEMORY_CRITICAL_THRESHOLD = 0.9; // 90%

  private cleanupInterval: NodeJS.Timeout | null = null;
  private memoryStats: MemoryStats[] = [];
  private readonly MAX_STATS_HISTORY = 288; // 24 hours at 5-minute intervals

  private constructor() {
    this.startMemoryMonitoring();
    this.enableGarbageCollection();
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  private startMemoryMonitoring(): void {
    this.cleanupInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, this.CLEANUP_INTERVAL_MS);

    // Monitor memory every minute
    setInterval(() => {
      this.checkMemoryUsage();
    }, 60000);
  }

  private enableGarbageCollection(): void {
    if (global.gc) {
      // Force garbage collection every 5 minutes in production
      setInterval(() => {
        if (process.env.NODE_ENV === 'production') {
          try {
            if (global.gc) {
              global.gc();
              logger.debug('🧹 Forced garbage collection completed');
            }
          } catch (error) {
            logger.debug('GC not available:', error);
          }
        }
      }, this.CLEANUP_INTERVAL_MS);
    }
  }

  private checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapUsagePercent = heapUsedMB / this.MAX_HEAP_SIZE_MB;

    // Store stats (with bounded history)
    const stats: MemoryStats = {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      rss: usage.rss
    };

    this.memoryStats.push(stats);
    if (this.memoryStats.length > this.MAX_STATS_HISTORY) {
      this.memoryStats.shift();
    }

    // Alert on high memory usage
    if (heapUsagePercent > this.MEMORY_CRITICAL_THRESHOLD) {
      logger.error(`🚨 CRITICAL: Memory usage at ${heapUsagePercent.toFixed(1)}% (${heapUsedMB.toFixed(1)}MB)`);
      this.performEmergencyCleanup();
    } else if (heapUsagePercent > this.MEMORY_WARNING_THRESHOLD) {
      logger.warn(`⚠️ High memory usage: ${heapUsagePercent.toFixed(1)}% (${heapUsedMB.toFixed(1)}MB)`);
    }
  }

  private performMemoryCleanup(): void {
    try {
      // Trigger garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Clear internal caches
      this.cleanupInternalCaches();

      logger.debug('🧹 Routine memory cleanup completed');
    } catch (error) {
      logger.error('Memory cleanup failed:', error);
    }
  }

  private performEmergencyCleanup(): void {
    try {
      logger.warn('🚨 Performing emergency memory cleanup');

      // Force multiple GC cycles
      if (global.gc) {
        for (let i = 0; i < 3; i++) {
          global.gc();
        }
      }

      // Clear all possible caches
      this.cleanupInternalCaches();

      // Reduce history retention
      this.memoryStats = this.memoryStats.slice(-100);

      logger.info('🧹 Emergency cleanup completed');
    } catch (error) {
      logger.error('Emergency cleanup failed:', error);
    }
  }

  private cleanupInternalCaches(): void {
    // This method should be called by other components to register their cleanup functions
    // For now, we'll just clear Node.js internal caches
    if (require.cache) {
      // Don't clear require cache in production as it can cause issues
      if (process.env.NODE_ENV !== 'production') {
        // Clear some non-critical cached modules
        Object.keys(require.cache).forEach(key => {
          if (key.includes('temp') || key.includes('cache')) {
            delete require.cache[key];
          }
        });
      }
    }
  }

  public getMemoryStats(): {
    current: MemoryStats;
    usage: {
      heapUsedMB: number;
      heapUsagePercent: number;
      rssUsageMB: number;
    };
    trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  } {
    const current = process.memoryUsage();
    const heapUsedMB = current.heapUsed / 1024 / 1024;
    const heapUsagePercent = heapUsedMB / this.MAX_HEAP_SIZE_MB;
    const rssUsageMB = current.rss / 1024 / 1024;

    // Calculate trend
    let trend: 'INCREASING' | 'STABLE' | 'DECREASING' = 'STABLE';
    if (this.memoryStats.length >= 2) {
      const recent = this.memoryStats.slice(-10);
      const old = this.memoryStats.slice(-20, -10);
      
      if (recent.length > 0 && old.length > 0) {
        const recentAvg = recent.reduce((sum, stat) => sum + stat.heapUsed, 0) / recent.length;
        const oldAvg = old.reduce((sum, stat) => sum + stat.heapUsed, 0) / old.length;
        
        const changePercent = ((recentAvg - oldAvg) / oldAvg) * 100;
        
        if (changePercent > 5) trend = 'INCREASING';
        else if (changePercent < -5) trend = 'DECREASING';
      }
    }

    return {
      current: {
        heapUsed: current.heapUsed,
        heapTotal: current.heapTotal,
        external: current.external,
        arrayBuffers: current.arrayBuffers,
        rss: current.rss
      },
      usage: {
        heapUsedMB,
        heapUsagePercent: heapUsagePercent * 100,
        rssUsageMB
      },
      trend
    };
  }

  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    logger.info('🧹 Memory manager shutdown completed');
  }
}

// Register cleanup callbacks for graceful shutdown
export const registerMemoryCleanup = (cleanupFn: () => void): void => {
  process.on('SIGTERM', cleanupFn);
  process.on('SIGINT', cleanupFn);
  process.on('SIGUSR2', cleanupFn);
};

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();
