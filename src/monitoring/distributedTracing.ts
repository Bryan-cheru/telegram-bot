/**
 * Distributed Tracing System - Missing from your current implementation
 * Industry standard for request/operation tracing across microservices
 */

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  tags: Record<string, any>;
  logs: Array<{
    timestamp: number;
    message: string;
    level: string;
  }>;
}

export class DistributedTracing {
  private static instance: DistributedTracing;
  private activeSpans = new Map<string, TraceContext>();

  static getInstance(): DistributedTracing {
    if (!DistributedTracing.instance) {
      DistributedTracing.instance = new DistributedTracing();
    }
    return DistributedTracing.instance;
  }

  /**
   * Start a new trace span
   */
  startSpan(operationName: string, parentSpanId?: string, tags: Record<string, any> = {}): string {
    const traceId = parentSpanId ? this.getTraceId(parentSpanId) : this.generateId();
    const spanId = this.generateId();

    const span: TraceContext = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      startTime: Date.now(),
      tags,
      logs: []
    };

    this.activeSpans.set(spanId, span);
    return spanId;
  }

  /**
   * Finish a span
   */
  finishSpan(spanId: string, tags: Record<string, any> = {}): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.tags = { ...span.tags, ...tags };
    const duration = Date.now() - span.startTime;

    // Log the completed span (in production, send to Jaeger/Zipkin)
    console.log(`[TRACE] ${span.operationName} [${span.traceId}/${span.spanId}] ${duration}ms`, {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      duration,
      tags: span.tags,
      logs: span.logs
    });

    this.activeSpans.delete(spanId);
  }

  /**
   * Add log to span
   */
  logToSpan(spanId: string, message: string, level: string = 'info'): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.logs.push({
      timestamp: Date.now(),
      message,
      level
    });
  }

  /**
   * Add tags to span
   */
  addTagsToSpan(spanId: string, tags: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.tags = { ...span.tags, ...tags };
  }

  /**
   * Get trace context for propagation
   */
  getTraceContext(spanId: string): { traceId: string; spanId: string } | null {
    const span = this.activeSpans.get(spanId);
    if (!span) return null;

    return {
      traceId: span.traceId,
      spanId: span.spanId
    };
  }

  private getTraceId(spanId: string): string {
    const span = this.activeSpans.get(spanId);
    return span ? span.traceId : this.generateId();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

/**
 * Decorator for automatic span creation
 */
export function Traced(operationName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const spanName = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const tracer = DistributedTracing.getInstance();
      const spanId = tracer.startSpan(spanName, undefined, {
        component: target.constructor.name,
        method: propertyKey
      });

      try {
        tracer.logToSpan(spanId, `Starting ${spanName}`);
        const result = await originalMethod.apply(this, args);
        tracer.addTagsToSpan(spanId, { success: true });
        return result;
      } catch (error) {
        tracer.addTagsToSpan(spanId, { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        tracer.logToSpan(spanId, `Error in ${spanName}: ${error}`, 'error');
        throw error;
      } finally {
        tracer.finishSpan(spanId);
      }
    };

    return descriptor;
  };
}
