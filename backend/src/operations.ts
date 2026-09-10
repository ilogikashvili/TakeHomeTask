import { CanActivate, Controller, ExecutionContext, ForbiddenException, Get, HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { PrismaService } from './database/prisma.service';
import { AuthUser } from './auth/auth.types';
import { CurrentUser } from './common/decorators/current-user.decorator';

export class QuotaExceededException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super({ message: 'Request quota exceeded; retry after the current quota window', retryAfterSeconds }, 429);
  }
}

@Injectable()
export class UsageGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ path: string; ip: string; user?: AuthUser }>();
    if (request.path.startsWith('/health')) return true;
    const identity = createHash('sha256').update(request.user?.sub ?? request.ip).digest('hex');
    await this.consume(identity, 60, this.config.get<number>('REQUESTS_PER_MINUTE') ?? 300);
    if (request.path.startsWith('/assistant')) {
      await this.consume('assistant-minute:' + identity, 60, this.config.get<number>('ASSISTANT_PER_MINUTE') ?? 10);
      await this.consume('assistant-day:' + identity, 86400, this.config.get<number>('ASSISTANT_PER_DAY') ?? 100);
      await this.consume('assistant-global', 86400, this.config.get<number>('ASSISTANT_GLOBAL_PER_DAY') ?? 1000);
    }
    return true;
  }
  async consume(identity: string, seconds: number, limit: number) {
    const window = Math.floor(Date.now() / (seconds * 1000));
    const key = identity + ':' + seconds + ':' + window;
    const expiry = new Date((window + 1) * seconds * 1000);
    const [bucket] = await this.prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "UsageBucket" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expiry})
      ON CONFLICT ("key") DO UPDATE SET "count" = "UsageBucket"."count" + 1 RETURNING "count"`;
    if (bucket.count > limit) throw new QuotaExceededException(Math.max(1, Math.ceil((expiry.getTime() - Date.now()) / 1000)));
  }
}

@Injectable()
export class OperationalMetrics {
  private counts = { requests: 0, errors: 0, durationMs: 0 };
  record(status: number, durationMs: number) { this.counts.requests++; if (status >= 500) this.counts.errors++; this.counts.durationMs += durationMs; }
  snapshot() { return { ...this.counts, uptimeSeconds: process.uptime(), memoryBytes: process.memoryUsage().rss }; }
}

@Injectable()
export class RetentionService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  @Cron('0 0 * * * *')
  async prune() {
    const now = new Date();
    await this.prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.prisma.usageBucket.deleteMany({ where: { expiresAt: { lt: now } } });
    if (this.config.get('RETENTION_ENABLED')) {
      const cutoff = new Date(now.getTime() - (this.config.get<number>('RETENTION_DAYS') ?? 90) * 86400000);
      await this.prisma.queryAudit.deleteMany({ where: { createdAt: { lt: cutoff } } });
      await this.prisma.assistantConversation.deleteMany({ where: { updatedAt: { lt: cutoff } } });
    }
  }
}

@Controller('ops')
export class OperationsController {
  constructor(private readonly prisma: PrismaService, private readonly metrics: OperationalMetrics) {}
  @Get('metrics')
  getMetrics(@CurrentUser() user: AuthUser) { if (user.role !== 'admin') throw new ForbiddenException(); return this.metrics.snapshot(); }
  @Get('audits')
  audits(@CurrentUser() user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException();
    return this.prisma.queryAudit.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 });
  }
}
