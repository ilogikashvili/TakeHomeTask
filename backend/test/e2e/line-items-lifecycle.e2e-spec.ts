import { INestApplication } from '@nestjs/common';
import { configureApp } from '../../src/bootstrap';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { AuthService } from '../../src/auth/auth.service';

describe('line item HTTP lifecycle and authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let admin: string;
  let ownerId: string;
  let otherId: string;
  let vendorId: string;
  const ids: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0);
    prisma = app.get(PrismaService);
    const owners = await prisma.owner.findMany({ take: 2 });
    [ownerId, otherId] = owners.map((owner) => owner.id);
    vendorId = (await prisma.vendor.findFirstOrThrow()).id;
    token = app.get(AuthService).sign({ sub: ownerId, ownerId, role: 'owner' });
    admin = app.get(AuthService).sign({ sub: ownerId, ownerId, role: 'admin' });
  });

  afterAll(async () => {
    await prisma.lineItem.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  async function request(method: string, path: string, body?: object, credential = token) {
    return fetch(`${await app.getUrl()}/line-items${path}`, {
      method, headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function create(scope = ownerId) {
    const response = await request('POST', '', {
      ownerId: scope, vendorId, name: `HTTP test ${randomUUID()}`, category: 'test', description: 'HTTP fixture',
      billingPeriod: 'MONTHLY', amount: 12.34, startDate: '2045-01-01', endDate: '2046-01-01',
    }, admin);
    expect(response.status).toBe(201);
    const item = await response.json() as { id: string; version: number };
    ids.push(item.id);
    return item;
  }

  it('commits approval events with status changes and detects competing updates', async () => {
    const item = await create();
    const responses = await Promise.all(['ACTIVE', 'PENDING_APPROVAL'].map((status) => request('PATCH', `/${item.id}`, {
      expectedVersion: 1, actorId: ownerId, status,
    })));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const saved = await prisma.lineItem.findUniqueOrThrow({ where: { id: item.id }, include: { approvals: true } });
    expect(saved.version).toBe(2);
    expect(saved.approvals).toHaveLength(2);
    expect(saved.approvals.find(event => event.action === 'CREATED')?.actorId).toBe(ownerId);
    expect(saved.approvals.find(event => event.action !== 'CREATED')?.toStatus).toBe(saved.status);
  });

  it('allows exactly one concurrent delete for an optimistic-lock version', async () => {
    const item = await create();
    const responses = await Promise.all([
      request('DELETE', `/${item.id}?expectedVersion=1`),
      request('DELETE', `/${item.id}?expectedVersion=1`),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await prisma.lineItem.findUniqueOrThrow({ where: { id: item.id } })).deletedAt).not.toBeNull();
  });

  it('allows exactly one concurrent bulk mutation for an optimistic-lock version', async () => {
    const item = await create();
    const body = { action: 'status', actorId: ownerId, status: 'ACTIVE', items: [{ id: item.id, expectedVersion: 1 }] };
    const responses = await Promise.all([request('POST', '/bulk', body), request('POST', '/bulk', body)]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect((await prisma.lineItem.findUniqueOrThrow({ where: { id: item.id } })).version).toBe(2);
  });

  it('rejects reassignment and forged approval actors by an owner', async () => {
    const item = await create();
    expect((await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: ownerId, ownerId: otherId })).status).toBe(403);
    expect((await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: otherId, status: 'ACTIVE' })).status).toBe(403);
    expect((await prisma.lineItem.findUniqueOrThrow({ where: { id: item.id } })).version).toBe(1);
  });

  it('rejects forged admin actors and audits non-status edits and deletion', async () => {
    const item = await create();
    expect((await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: otherId, name: 'forged' }, admin)).status).toBe(403);
    expect((await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: ownerId, amount: '999999999999.999' }, admin)).status).toBe(400);
    expect((await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: ownerId, amount: '1000000000000' }, admin)).status).toBe(400);
    expect((await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: ownerId, name: 'Audited edit' }, admin)).status).toBe(200);
    expect((await request('DELETE', `/${item.id}?expectedVersion=1`, undefined, admin)).status).toBe(409);
    expect((await request('DELETE', `/${item.id}?expectedVersion=2`, undefined, admin)).status).toBe(200);
    const events = await prisma.approvalEvent.findMany({ where: { lineItemId: item.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map(event => event.action)).toEqual(['CREATED', 'UPDATED', 'DELETED']);
    expect(events.every(event => event.actorId === ownerId)).toBe(true);
  });

  it('persists logout revocation and restricts operations endpoints', async () => {
    const session = app.get(AuthService).sign({ sub: ownerId, ownerId, role: 'owner' });
    const base = await app.getUrl();
    const headers = { authorization: `Bearer ${session}` };
    expect((await fetch(base + '/health/ready')).status).toBe(200);
    expect((await fetch(base + '/ops/audits', { headers })).status).toBe(403);
    expect((await fetch(base + '/ops/metrics', { headers: { authorization: `Bearer ${admin}` } })).status).toBe(200);
    expect((await fetch(base + '/auth/logout', { method: 'POST', headers })).status).toBe(201);
    expect(await prisma.revokedToken.findUnique({ where: { id: app.get(AuthService).metadata(session).jti } })).not.toBeNull();
    expect((await fetch(base + '/auth/me', { headers })).status).toBe(401);
  });

  it('blocks foreign writes and allows the admin to reassign', async () => {
    const item = await create(otherId);
    expect((await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: ownerId, name: 'forbidden' })).status).toBe(409);
    expect((await request('DELETE', `/${item.id}?expectedVersion=1`)).status).toBe(404);
    expect((await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: ownerId, ownerId }, admin)).status).toBe(200);
  });

  it('soft deletes and removes the item from filtered totals', async () => {
    const item = await create();
    expect((await request('DELETE', `/${item.id}?expectedVersion=1`)).status).toBe(200);
    const saved = await prisma.lineItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(saved.deletedAt).not.toBeNull();
    const response = await request('GET', `?search=${encodeURIComponent(saved.name)}`);
    const ledger = await response.json() as { items: unknown[]; aggregates: { matchingCount: number } };
    expect(ledger.items).toEqual([]);
    expect(ledger.aggregates.matchingCount).toBe(0);
  });

  it('rejects invalid values and missing authentication', async () => {
    const item = await create();
    for (const patch of [{ amount: -1 }, { expectedVersion: 0 }, { startDate: 'not-a-date' }, { endDate: '2040-01-01' }]) {
      expect((await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: ownerId, ...patch })).status).toBe(400);
    }
    expect((await request('PATCH', '/invalid', { expectedVersion: 1, actorId: ownerId })).status).toBe(400);
    expect((await request('GET', '', undefined, '')).status).toBe(401);
  });

  it('validates nulls, calendar dates, decimal precision and foreign references', async () => {
    const item = await create();
    for (const patch of [{ amount: null }, { ownerId: null }, { name: null }, { amount: 1.001 }, { startDate: '2045-02-30' }, { endDate: '2046-01-01T12:00:00Z' }]) {
      const response = await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: ownerId, ...patch });
      expect(response.status).toBe(400);
      expect((await response.json() as { error: { details: string[] } }).error.details.length).toBeGreaterThan(0);
    }
    expect((await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: ownerId, renewalDate: null })).status).toBe(200);
    expect((await prisma.lineItem.findUniqueOrThrow({ where: { id: item.id } })).renewalDate).toBeNull();
    expect((await request('PATCH', `/${item.id}`, { expectedVersion: 2, actorId: ownerId, ownerId: randomUUID() }, admin)).status).toBe(400);
  });

  it('exposes authorized lookups and history while disabling demo login in tests', async () => {
    const base = await app.getUrl();
    const get = (path: string, credential = token) => fetch(base + path, { headers: { authorization: `Bearer ${credential}` } });
    expect((await (await get('/owners')).json() as Array<{ id: string }>).map(owner => owner.id)).toEqual([ownerId]);
    const item = await create(otherId);
    expect((await get(`/line-items/${item.id}/approvals`)).status).toBe(404);
    expect((await get(`/line-items/${item.id}/approvals`, admin)).status).toBe(200);
    expect((await get('/auth/demo/owners')).status).toBe(404);
    expect((await get('/reminders/unread', admin)).status).toBe(400);
    expect((await get('/reminders/unread?ownerId=invalid', admin)).status).toBe(400);
  });

  it.each(['single', 'bulk'])('transfers reminder ownership atomically with %s reassignment', async mode => {
    const item = await create();
    const reminder = await prisma.reminder.create({ data: { lineItemId: item.id, ownerId, renewalDate: new Date('2045-12-01') } });
    const notification = await prisma.notification.create({ data: { ownerId, reminderId: reminder.id, type: 'RENEWAL_REMINDER' } });
    const response = mode === 'single'
      ? await request('PATCH', `/${item.id}`, { expectedVersion: 1, actorId: ownerId, ownerId: otherId }, admin)
      : await request('POST', '/bulk', { action: 'reassign', actorId: ownerId, ownerId: otherId, items: [{ id: item.id, expectedVersion: 1 }] }, admin);
    expect(response.status).toBe(mode === 'single' ? 200 : 201);
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).ownerId).toBe(otherId);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).ownerId).toBe(otherId);
    const unread = await fetch(`${await app.getUrl()}/reminders/unread`, { headers: { authorization: `Bearer ${token}` } });
    expect((await unread.json() as Array<{ id: string }>).some(value => value.id === notification.id)).toBe(false);
  });

  it('rolls back an entire bulk batch on conflict, then audits successful changes', async () => {
    const first = await create();
    const second = await create();
    const items = [first, second].sort((a, b) => a.id.localeCompare(b.id));
    const conflict = await request('POST', '/bulk', { action: 'status', actorId: ownerId, status: 'ACTIVE',
      items: items.map((item, index) => ({ id: item.id, expectedVersion: index === 1 ? 999 : 1 })),
    });
    expect(conflict.status).toBe(409);
    expect(await prisma.approvalEvent.count({ where: { lineItemId: { in: items.map((item) => item.id) } }, })).toBe(2);
    expect((await prisma.lineItem.findUniqueOrThrow({ where: { id: items[0].id } })).version).toBe(1);
    const versions = (version: number) => items.map((item) => ({ id: item.id, expectedVersion: version }));
    expect((await request('POST', '/bulk', { action: 'status', actorId: ownerId, status: 'ACTIVE', items: versions(1) })).status).toBe(201);
    expect((await request('POST', '/bulk', { action: 'reassign', actorId: ownerId, ownerId: otherId, items: versions(2) })).status).toBe(403);
    expect((await request('POST', '/bulk', { action: 'reassign', actorId: ownerId, ownerId: otherId, items: versions(2) }, admin)).status).toBe(201);
    expect((await request('POST', '/bulk', { action: 'delete', actorId: ownerId, items: versions(3) }, admin)).status).toBe(201);
    expect(await prisma.approvalEvent.count({ where: { lineItemId: { in: items.map((item) => item.id) } } })).toBe(8);
  });

  it('rejects empty, duplicate and oversized bulk selections', async () => {
    const item = await create();
    for (const items of [[], [{ id: item.id, expectedVersion: 1 }, { id: item.id, expectedVersion: 1 }],
      Array.from({ length: 101 }, () => ({ id: randomUUID(), expectedVersion: 1 }))]) {
      expect((await request('POST', '/bulk', { action: 'delete', actorId: ownerId, items })).status).toBe(400);
    }
  });

  it('exports filtered owner rows and neutralizes spreadsheet formulas', async () => {
    const item = await create();
    const name = '=HYPERLINK("https://example.invalid")';
    await prisma.lineItem.update({ where: { id: item.id }, data: { name } });
    const response = await request('GET', `/export?search=${encodeURIComponent(name)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    const csv = await response.text();
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(csv).toContain(item.id);
    expect(csv.trim().split('\r\n')).toHaveLength(2);
  });
});
