import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { LineItemsRepository } from '../../src/line-items/line-items.repository';
import { LedgerQueryDto } from '../../src/line-items/dto/ledger-query.dto';
import { UsageGuard } from '../../src/operations';

describe('database consistency and shared quotas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    await app.init(); prisma = app.get(PrismaService);
  });
  afterAll(async () => { await app.close(); });

  it.each([false, true])('preserves row/aggregate and successive page snapshots (readonly=%s)', async readOnly => {
    const source = await prisma.lineItem.findFirstOrThrow();
    const category = 'snapshot-' + randomUUID();
    const item = await prisma.lineItem.create({ data: { ownerId: source.ownerId, vendorId: source.vendorId, category,
      name: category, amount: 10, billingPeriod: 'MONTHLY', startDate: source.startDate, endDate: source.endDate } });
    const repo = app.get(LineItemsRepository);
    const query = Object.assign(new LedgerQueryDto(), { category });
    try {
      await repo.withSnapshot(readOnly, async tx => {
        expect((await repo.findPage(query, readOnly, tx)).items[0].amount).toBe('10.00');
        await prisma.lineItem.update({ where: { id: item.id }, data: { amount: 99 } });
        expect((await repo.findAggregates(query, readOnly, tx)).totalAmount).toBe('10.00');
        expect((await repo.findPage(query, readOnly, tx)).items[0].amount).toBe('10.00');
      });
      expect((await repo.findAggregates(query, readOnly)).totalAmount).toBe('99.00');
    } finally { await prisma.lineItem.delete({ where: { id: item.id } }); }
  });

  it('enforces a shared limit under simultaneous requests', async () => {
    const identity = 'quota-test-' + randomUUID();
    try {
      const results = await Promise.allSettled(Array.from({ length: 12 }, () => app.get(UsageGuard).consume(identity, 3600, 3)));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(3);
      const failures = results.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
      expect(failures.every(result => result.reason.getStatus() === 429)).toBe(true);
    } finally { await prisma.usageBucket.deleteMany({ where: { key: { startsWith: identity } } }); }
  });
});
