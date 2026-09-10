import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';

describe('seed integrity', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('builds a semantically useful business dataset with the supported billing and status model', async () => {
    const ownerCount = await prisma.owner.count();
    const vendorCount = await prisma.vendor.count();
    const lineItemCount = await prisma.lineItem.count();

    expect(ownerCount).toBeGreaterThanOrEqual(20);
    expect(ownerCount).toBeLessThanOrEqual(40);
    expect(vendorCount).toBe(200);
    expect(lineItemCount).toBeGreaterThanOrEqual(2000);
    expect(lineItemCount).toBeLessThanOrEqual(4000);

    const statusCounts = await prisma.lineItem.groupBy({ by: ['status'], _count: { _all: true } });
    const statusMap = Object.fromEntries(statusCounts.map(entry => [entry.status, entry._count._all]));
    expect(statusMap.ACTIVE).toBeGreaterThan(0);
    expect(statusMap.PENDING_APPROVAL).toBeGreaterThan(0);
    expect(statusMap.TERMINATED).toBeGreaterThan(0);
    expect(statusMap.DRAFT).toBeGreaterThan(0);

    const billingCounts = await prisma.lineItem.groupBy({ by: ['billingPeriod'], _count: { _all: true } });
    const billingMap = Object.fromEntries(billingCounts.map(entry => [entry.billingPeriod, entry._count._all]));
    expect(billingMap.WEEKLY).toBeGreaterThan(0);
    expect(billingMap.MONTHLY).toBeGreaterThan(0);
    expect(billingMap.QUARTERLY).toBeGreaterThan(0);
    expect(billingMap.ANNUAL).toBeGreaterThan(0);

    const approvalEventsByItem = await prisma.approvalEvent.groupBy({ by: ['lineItemId'], _count: { _all: true } });
    const maxApprovalEventsPerLineItem = Math.max(0, ...approvalEventsByItem.map(entry => entry._count._all));
    expect(maxApprovalEventsPerLineItem).toBeLessThanOrEqual(8);

    const itemsWithNoApproval = await prisma.lineItem.count({ where: { approvals: { none: {} } } });
    expect(itemsWithNoApproval).toBeGreaterThan(0);

    const renewalsPresent = await prisma.lineItem.count({ where: { renewalDate: { not: null } } });
    const renewalsMissing = await prisma.lineItem.count({ where: { renewalDate: null } });
    expect(renewalsPresent).toBeGreaterThan(0);
    expect(renewalsMissing).toBeGreaterThan(0);

    const withinSixtyDays = await prisma.lineItem.count({
      where: {
        status: 'ACTIVE',
        renewalDate: { gte: new Date(), lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
      },
    });
    expect(withinSixtyDays).toBeGreaterThan(0);

    const softwareItems = await prisma.lineItem.count({ where: { category: 'software' } });
    const softwareVendors = await prisma.vendor.count({ where: { category: 'software' } });
    const softwareActiveValue = await prisma.lineItem.aggregate({
      _sum: { amount: true },
      where: { category: 'software', status: 'ACTIVE' },
    });
    expect(softwareItems).toBeGreaterThan(100);
    expect(softwareVendors).toBeGreaterThan(30);
    expect(Number(softwareActiveValue._sum.amount ?? 0)).toBeGreaterThan(0);

    const categoryCount = await prisma.lineItem.groupBy({ by: ['category'], _count: { _all: true } });
    expect(categoryCount.length).toBeGreaterThanOrEqual(5);
  });
});
