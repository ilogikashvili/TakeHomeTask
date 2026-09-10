import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../auth/auth.decorators';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('ready')
  @Public()
  async ready() {
    try {
      await this.prisma.$transaction(async tx => { await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '3000ms'"); await tx.$queryRaw`SELECT 1`; }, { timeout: 4000, maxWait: 2000 });
      return { status: 'ready' };
    } catch { throw new ServiceUnavailableException('Database is unavailable'); }
  }
  @Get()
  @Public()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
