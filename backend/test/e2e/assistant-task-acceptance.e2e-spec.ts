import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';

describe('assistant task acceptance', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let ownerId: string;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0);
    prisma = app.get(PrismaService);
    const owner = await prisma.owner.findFirstOrThrow();
    ownerId = owner.id;
    token = app.get(AuthService).sign({ sub: 'assistant-acceptance-owner', role: 'owner', ownerId: owner.id });
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers annual software spend with the deterministic annualization basis', async () => {
    const category = 'software';
    const cleanOwner = await prisma.owner.create({
      data: {
        name: `Acceptance owner ${randomUUID()}`,
        email: `assistant-acceptance-${randomUUID()}@example.com`,
      },
    });
    const cleanToken = app.get(AuthService).sign({ sub: cleanOwner.id, role: 'owner', ownerId: cleanOwner.id });
    const itemIds: string[] = [];
    const vendor = await prisma.vendor.findFirstOrThrow({ where: { category } });
    try {
      for (const fixture of [
        { name: 'monthly', amount: '100', billingPeriod: 'MONTHLY' },
        { name: 'quarterly', amount: '100', billingPeriod: 'QUARTERLY' },
        { name: 'annual', amount: '100', billingPeriod: 'ANNUAL' },
        { name: 'weekly', amount: '100', billingPeriod: 'WEEKLY' },
      ]) {
        const created = await prisma.lineItem.create({ data: {
          ownerId: cleanOwner.id,
          vendorId: vendor.id,
          category,
          name: fixture.name,
          amount: fixture.amount,
          billingPeriod: fixture.billingPeriod as Prisma.LineItemCreateInput['billingPeriod'],
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          renewalDate: new Date('2025-02-01'),
          status: 'ACTIVE',
        } });
        itemIds.push(created.id);
      }
      const response = await fetch(`${url}/assistant/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cleanToken}` },
        body: JSON.stringify({ question: 'How much do we spend on software a year?' }),
      });
      const body = await response.json() as { status: string; answer: string; filters: { category?: string }; ledger: { aggregates: { annualizedAmount: string; totalAmount: string; matchingCount: number } } };
      expect(response.status).toBe(201);
      expect(body.status).toBe('answered');
      expect(body.filters.category).toBe(category);
      expect(body.ledger.aggregates.annualizedAmount).toBe('6900.00');
      expect(body.answer).toContain('annualized recurring spend');
    } finally {
      await prisma.lineItem.deleteMany({ where: { id: { in: itemIds } } });
      await prisma.owner.delete({ where: { id: cleanOwner.id } });
    }
  });

  it('resolves unsupported questions without hallucinating a number', async () => {
    const response = await fetch(`${url}/assistant/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: 'How many people are in the finance team?' }),
    });
    const body = await response.json() as { status: string; answer?: string };
    expect(response.status).toBe(201);
    expect(body.status).toBe('refused');
    expect(body.answer).toContain('I support subscription spend totals');
  });

  it('uses structured follow-up context when narrowing a prior question', async () => {
    const response = await fetch(`${url}/assistant/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: 'How much do we spend on software?' }),
    });
    const first = await response.json() as { conversationId?: string; status: string; filters?: { category?: string } };
    expect(first.status).toBe('answered');
    expect(first.conversationId).toBeDefined();
    expect(first.filters?.category).toBe('software');

    const followUp = await fetch(`${url}/assistant/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: 'What about only contracts over ₾50,000?', conversationId: first.conversationId }),
    });
    const body = await followUp.json() as { status: string; filters?: { category?: string; minAmount?: number } };
    expect(followUp.status).toBe(201);
    expect(body.status).toBe('answered');
    expect(body.filters?.category).toBe('software');
    expect(body.filters?.minAmount).toBe(50000);
  });

  it('resolves a unique vendor typo without guessing', async () => {
    const vendor = await prisma.vendor.create({ data: { name: 'Microsoft', normalizedName: 'microsoft', category: 'software' } });
    await prisma.lineItem.create({ data: {
      ownerId,
      vendorId: vendor.id,
      category: 'software',
      name: 'microsoft typo contract',
      amount: '100.00',
      billingPeriod: 'MONTHLY',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      renewalDate: new Date('2025-02-01'),
      status: 'ACTIVE',
    } });
    const response = await fetch(`${url}/assistant/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: 'How much do we pay micro soft?' }),
    });
    const body = await response.json() as { status: string; filters?: { vendorId?: string } };
    expect(response.status).toBe(201);
    expect(body.status).toBe('answered');
    expect(body.filters?.vendorId).toBe(vendor.id);
    await prisma.lineItem.deleteMany({ where: { name: 'microsoft typo contract', ownerId } });
    await prisma.vendor.delete({ where: { id: vendor.id } });
  });

  it('requires clarification when multiple vendor candidates are plausible', async () => {
    await prisma.vendor.createMany({ data: [
      { name: 'Microsoft', normalizedName: 'microsoft', category: 'software' },
      { name: 'Microsoft Azure', normalizedName: 'microsoftazure', category: 'software' },
      { name: 'Microsoft 365', normalizedName: 'microsoft365', category: 'software' },
    ] });
    const vendorIds = await prisma.vendor.findMany({ where: { name: { in: ['Microsoft', 'Microsoft Azure', 'Microsoft 365'] } }, select: { id: true } });
    for (const vendorId of vendorIds) {
      await prisma.lineItem.create({ data: {
        ownerId,
        vendorId: vendorId.id,
        category: 'software',
        name: `ambiguous vendor ${vendorId.id}`,
        amount: '100.00',
        billingPeriod: 'MONTHLY',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        renewalDate: new Date('2025-02-01'),
        status: 'ACTIVE',
      } });
    }
    const response = await fetch(`${url}/assistant/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: 'How much do we pay micro soft?' }),
    });
    const body = await response.json() as { status: string; question?: string; candidates?: unknown[] };
    expect(response.status).toBe(201);
    expect(body.status).toBe('clarification_required');
    await prisma.lineItem.deleteMany({ where: { ownerId, name: { startsWith: 'ambiguous vendor ' } } });
    await prisma.vendor.deleteMany({ where: { name: { in: ['Microsoft', 'Microsoft Azure', 'Microsoft 365'] } } });
  });
});