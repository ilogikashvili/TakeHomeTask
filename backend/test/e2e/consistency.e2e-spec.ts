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

  it('computes annualized recurring spend with the locked billing-period contract', async () => {
    const source = await prisma.lineItem.findFirstOrThrow();
    const category = 'contract-proof-recurring';
    const query = Object.assign(new LedgerQueryDto(), { ownerId: source.ownerId, category, status: 'ACTIVE' });
    const itemIds: string[] = [];
    try {
      const fixtures = [
        { amount: '100', billingPeriod: 'MONTHLY', name: 'monthly' },
        { amount: '100', billingPeriod: 'QUARTERLY', name: 'quarterly' },
        { amount: '100', billingPeriod: 'ANNUAL', name: 'annual' },
        { amount: '100', billingPeriod: 'WEEKLY', name: 'weekly' },
      ] as const;
      for (const fixture of fixtures) {
        const created = await prisma.lineItem.create({ data: {
          ownerId: source.ownerId,
          vendorId: source.vendorId,
          category,
          name: fixture.name,
          amount: fixture.amount,
          billingPeriod: fixture.billingPeriod,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          renewalDate: new Date('2025-02-01'),
          status: 'ACTIVE',
        } });
        itemIds.push(created.id);
      }
      const aggregates = await app.get(LineItemsRepository).findAggregates(query);
      expect(aggregates.annualizedAmount).toBe('6900.00');
      expect(aggregates.totalAmount).toBe('400.00');
    } finally {
      await prisma.lineItem.deleteMany({ where: { id: { in: itemIds } } });
    }
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
