import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QuotaExceededException } from '../../operations';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest<{ requestId?: string }>();
    const referenceError = exception instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2025'].includes(exception.code);
    const status = exception instanceof HttpException ? exception.getStatus() : referenceError ? 400 : 500;
    if (exception instanceof QuotaExceededException) response.header('Retry-After', String(exception.retryAfterSeconds));
    const message = exception instanceof HttpException ? exception.message : referenceError ? 'A referenced record does not exist or cannot be used' : 'Request failed';
    const detail = exception instanceof HttpException ? exception.getResponse() : undefined;
    const details = typeof detail === 'object' && detail && 'message' in detail && Array.isArray(detail.message) ? detail.message : undefined;
    const code = status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
    response.status(status).json({
      error: { code, message, details, requestId: request.requestId ?? 'unknown' },
    });
  }
}
