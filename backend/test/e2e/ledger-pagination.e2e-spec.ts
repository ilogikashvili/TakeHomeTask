import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { LedgerSortField, SortDirection } from '../../src/line-items/dto/ledger-query.dto';
import { Prisma } from '@prisma/client';

describe('ledger pagination', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0);
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    adminToken = auth.sign({ sub: 'e2e-admin', role: 'admin' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('walks every page without gaps or duplicates', async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    const baseUrl = await app.getUrl();

    do {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) query.set('cursor', cursor);
      const response = await fetch(`${baseUrl}/line-items?${query}`, { headers: { authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBe(200);
      const body = await response.json() as { items: Array<{ id: string }>; nextCursor: string | null };
      ids.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor;
    } while (cursor);

    expect(ids).toHaveLength(await prisma.lineItem.count({ where: { deletedAt: null } }));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(Object.values(LedgerSortField).flatMap((sort) => Object.values(SortDirection).map((direction) => [sort, direction] as const)))
  ('preserves the complete ordered set and totals for %s %s', async (sort, direction) => {
    const owner = await prisma.owner.findFirstOrThrow();
    const orderBy = sort === 'vendor' ? { vendor: { name: direction } } : { [sort]: direction };
    const expected = await prisma.lineItem.findMany({
      where: { ownerId: owner.id, deletedAt: null },
      orderBy: [orderBy, { id: direction as 'asc' | 'desc' }],
    });
    // PostgreSQL's default NULL position differs from the ledger's date sentinel.
    if (sort === 'renewalDate') expected.sort((a, b) => {
      const av = a.renewalDate?.getTime() ?? new Date('9999-12-31').getTime();
      const bv = b.renewalDate?.getTime() ?? new Date('9999-12-31').getTime();
      const cmp = av - bv || a.id.localeCompare(b.id);
      return direction === 'asc' ? cmp : -cmp;
    });
    const ids: string[] = [];
    let cursor: string | null = null;
    let total: string | undefined;
    do {
      const query = new URLSearchParams({ ownerId: owner.id, sort, direction, limit: '7' });
      if (cursor) query.set('cursor', cursor);
      const response = await fetch(`${await app.getUrl()}/line-items?${query}`, { headers: { authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBe(200);
      const body = await response.json() as { items: Array<{ id: string; version: number }>; nextCursor: string | null; aggregates: { matchingCount: number; totalAmount: string } };
      expect(body.aggregates.matchingCount).toBe(expected.length);
      total ??= body.aggregates.totalAmount;
      expect(body.aggregates.totalAmount).toBe(total);
      expect(body.items.every((item) => item.version >= 1)).toBe(true);
      ids.push(...body.items.map((item) => item.id));
      expect(ids.length).toBeLessThanOrEqual(expected.length);
      cursor = body.nextCursor;
    } while (cursor);
    expect(ids).toEqual(expected.map((item) => item.id));
  });

  it.each(['not-json', Buffer.from(JSON.stringify({ value: 'garbage', id: 'bad-id' })).toString('base64url')])
  ('rejects malformed cursors with HTTP 400', async (cursor) => {
    const response = await fetch(`${await app.getUrl()}/line-items?cursor=${cursor}`, { headers: { authorization: `Bearer ${adminToken}` } });
    expect(response.status).toBe(400);
  });

  it('returns aggregates matching filtered database results', async () => {
    const where = { status: 'ACTIVE' as const, category: 'infrastructure', amount: { gte: 100000 } };
    const [expectedCount, expectedSum] = await Promise.all([
      prisma.lineItem.count({ where: { ...where, deletedAt: null } }),
      prisma.lineItem.aggregate({ where: { ...where, deletedAt: null }, _sum: { amount: true } }),
    ]);
    const response = await fetch(`${await app.getUrl()}/line-items?status=ACTIVE&category=infrastructure&minAmount=100000&limit=10`, { headers: { authorization: `Bearer ${adminToken}` } });
    const body = await response.json() as {
      items: Array<{ status: string; category: string; amount: string }>;
      aggregates: { matchingCount: number; totalAmount: string };
    };

    expect(response.status).toBe(200);
    expect(body.items.every((item) => item.status === 'ACTIVE' && item.category === 'infrastructure' && Number(item.amount) >= 100000)).toBe(true);
    expect(body.aggregates.matchingCount).toBe(expectedCount);
    expect(body.aggregates.totalAmount).toBe(expectedSum._sum.amount?.toFixed(2) ?? '0.00');
  });

  it('uses the filtered set for vendor and category breakdowns', async () => {
    const owner = await prisma.owner.findFirstOrThrow();
    const where = { ownerId: owner.id, deletedAt: null };
    const [vendors, categories] = await Promise.all([
      prisma.lineItem.groupBy({ by: ['vendorId'], where, _sum: { amount: true }, _count: true }),
      prisma.lineItem.groupBy({ by: ['category'], where, _sum: { amount: true }, _count: true }),
    ]);
    const response = await fetch(`${await app.getUrl()}/line-items?ownerId=${owner.id}&limit=1`, { headers: { authorization: `Bearer ${adminToken}` } });
    const body = await response.json() as { aggregates: { byVendor: Array<{ vendorId: string; totalAmount: string; matchingCount: number }>; byCategory: Array<{ category: string; totalAmount: string; matchingCount: number }> } };
    for (const group of vendors) expect(body.aggregates.byVendor.find((row) => row.vendorId === group.vendorId)).toMatchObject({ totalAmount: group._sum.amount!.toFixed(2), matchingCount: group._count });
    for (const group of categories) expect(body.aggregates.byCategory.find((row) => row.category === group.category)).toEqual({ category: group.category, totalAmount: group._sum.amount!.toFixed(2), matchingCount: group._count });
  });

  it('matches database filters, including inclusive decimal and renewal boundaries', async () => {
    const sample = await prisma.lineItem.findFirstOrThrow({ where: { deletedAt: null, renewalDate: { not: null } } });
    const date = sample.renewalDate!.toISOString().slice(0, 10);
    const cases: Array<[Record<string, string>, Prisma.LineItemWhereInput]> = [
      [{ vendorId: sample.vendorId }, { vendorId: sample.vendorId }],
      [{ category: sample.category }, { category: sample.category }],
      [{ status: sample.status }, { status: sample.status }],
      [{ minAmount: sample.amount.toString(), maxAmount: sample.amount.toString() }, { amount: sample.amount }],
      [{ renewalFrom: date, renewalTo: date }, { renewalDate: sample.renewalDate }],
      [{ search: sample.name }, { OR: [
        { name: { contains: sample.name, mode: 'insensitive' } },
        { description: { contains: sample.name, mode: 'insensitive' } },
        { vendor: { name: { contains: sample.name, mode: 'insensitive' } } },
      ] }],
    ];
    for (const [filters, condition] of cases) {
      const where = { ...condition, deletedAt: null };
      const expected = await prisma.lineItem.findMany({ where });
      const sum = await prisma.lineItem.aggregate({ where, _sum: { amount: true } });
      const response = await fetch(`${await app.getUrl()}/line-items?${new URLSearchParams({ ...filters, limit: '100' })}`, { headers: { authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBe(200);
      const body = await response.json() as { items: Array<{ id: string }>; aggregates: { matchingCount: number; totalAmount: string } };
      expect(body.aggregates.matchingCount).toBe(expected.length);
      expect(body.aggregates.totalAmount).toBe(sum._sum.amount?.toFixed(2) ?? '0.00');
      expect(body.items.every((row) => expected.some((item) => item.id === row.id))).toBe(true);
      expect(body.items.length).toBe(Math.min(100, expected.length));
    }
  });

  it('scopes owner reads to the owner claim', async () => {
    const owner = await prisma.owner.findFirstOrThrow();
    const expectedCount = await prisma.lineItem.count({ where: { ownerId: owner.id, deletedAt: null } });
    const ownerToken = auth.sign({ sub: owner.id, role: 'owner', ownerId: owner.id });
    const response = await fetch(`${await app.getUrl()}/line-items?limit=100`, { headers: { authorization: `Bearer ${ownerToken}` } });
    const body = await response.json() as { items: Array<{ ownerId: string }>; aggregates: { matchingCount: number } };

    expect(response.status).toBe(200);
    expect(body.items.every((item) => item.ownerId === owner.id)).toBe(true);
    expect(body.aggregates.matchingCount).toBe(expectedCount);
  });
});
