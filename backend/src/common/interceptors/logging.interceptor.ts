import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { finalize, Observable, tap } from 'rxjs';
import pino from 'pino';
import { OperationalMetrics } from '../../operations';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly metrics: OperationalMetrics) {}
  private readonly logger = pino({ level: process.env.NODE_ENV === 'test' ? 'silent' : process.env.LOG_LEVEL || 'info' });

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method: string; route?: { path: string }; requestId?: string }>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    const startedAt = Date.now();
    let status: number | undefined;
    return next.handle().pipe(
      tap({ error: (error: unknown) => { status = error instanceof HttpException ? error.getStatus() : 500; } }),
      finalize(() => {
        const durationMs = Date.now() - startedAt;
        this.metrics.record(status ?? response.statusCode, durationMs);
        this.logger.info({ requestId: request.requestId, method: request.method, route: request.route?.path, status: status ?? response.statusCode, durationMs }, 'HTTP request completed');
      }),
    );
  }
}
