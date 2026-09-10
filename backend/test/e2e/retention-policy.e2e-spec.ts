import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { RetentionService } from '../../src/operations';

describe('retention policy', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let retention: RetentionService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ RETENTION_ENABLED: 'true', RETENTION_DAYS: '90' }))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    retention = app.get(RetentionService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('purges only stale audit and conversation records while preserving live financial data', async () => {
    const owner = await prisma.owner.findFirstOrThrow();
    const vendor = await prisma.vendor.findFirstOrThrow();
    const staleAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    const freshAt = new Date();

    const staleConversation = await prisma.assistantConversation.create({
      data: {
        ownerId: owner.id,
        updatedAt: staleAt,
        messages: {
          create: [{ role: 'user', content: 'stale question' }, { role: 'assistant', content: 'stale answer' }],
        },
      },
      include: { messages: true },
    });

    const freshConversation = await prisma.assistantConversation.create({
      data: {
        ownerId: owner.id,
        messages: {
          create: [{ role: 'user', content: 'fresh question' }],
        },
      },
      include: { messages: true },
    });

    const staleAudit = await prisma.queryAudit.create({
      data: { question: 'stale audit', resolvedIntent: {}, createdAt: staleAt, resultCount: 0 },
    });

    const freshAudit = await prisma.queryAudit.create({
      data: { question: 'fresh audit', resolvedIntent: {}, createdAt: freshAt, resultCount: 1 },
    });

    const item = await prisma.lineItem.create({
      data: {
        ownerId: owner.id,
        vendorId: vendor.id,
        category: 'software',
        name: 'retention-guard',
        amount: '99.00',
        billingPeriod: 'MONTHLY',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        status: 'ACTIVE',
      },
    });

    const approval = await prisma.approvalEvent.create({
      data: {
        lineItemId: item.id,
        actorId: owner.id,
        action: 'APPROVED',
        toStatus: 'ACTIVE',
        note: 'retention guard',
      },
    });

    await retention.prune();

    expect(await prisma.queryAudit.findUnique({ where: { id: staleAudit.id } })).toBeNull();
    expect(await prisma.queryAudit.findUnique({ where: { id: freshAudit.id } })).not.toBeNull();
    expect(await prisma.assistantConversation.findUnique({ where: { id: staleConversation.id } })).toBeNull();
    expect(await prisma.assistantConversation.findUnique({ where: { id: freshConversation.id } })).not.toBeNull();
    expect(await prisma.lineItem.findUnique({ where: { id: item.id } })).not.toBeNull();
    expect(await prisma.approvalEvent.findUnique({ where: { id: approval.id } })).not.toBeNull();
  });
});
