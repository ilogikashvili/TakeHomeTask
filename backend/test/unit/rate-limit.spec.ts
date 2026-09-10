import { ConfigService } from '@nestjs/config';
import { QuotaExceededException, UsageGuard } from '../../src/operations';

describe('UsageGuard', () => {
  it('rejects over-limit requests with a bounded retry window', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ count: 2 }]) } as never;
    const guard = new UsageGuard(prisma, new ConfigService());

    await expect(guard.consume('user', 60, 1)).rejects.toBeInstanceOf(QuotaExceededException);
    try {
      await guard.consume('user', 60, 1);
    } catch (error) {
      expect((error as QuotaExceededException).retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect((error as QuotaExceededException).retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });
});