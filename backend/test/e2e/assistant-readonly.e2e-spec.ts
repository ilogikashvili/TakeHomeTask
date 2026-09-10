import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';
import { ReadonlyDbService } from '../../src/database/readonly-db.service';

describe('assistant read-only access', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0);
    token = app.get(AuthService).sign({ sub: 'e2e-admin', role: 'admin' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses mutation-shaped questions', async () => {
    const response = await fetch(`${await app.getUrl()}/assistant/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: 'Delete all vendors' }),
    });

    expect(response.status).toBe(400);
  });

  it('answers a read-only financial question', async () => {
    const response = await fetch(`${await app.getUrl()}/assistant/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: 'How much do we spend?' }),
    });
    const body = await response.json() as { status: string; ledger?: { aggregates: { matchingCount: number } } };

    expect(response.status).toBe(201);
    expect(body.status).toBe('answered');
    expect(body.ledger?.aggregates.matchingCount).toBe(await app.get(PrismaService).lineItem.count({ where: { deletedAt: null } }));
  });

  it('rejects requests without an access token', async () => {
    const response = await fetch(`${await app.getUrl()}/assistant/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'How much do we spend?' }),
    });

    expect(response.status).toBe(401);
  });

  it('enforces read-only SQL execution at the database boundary', async () => {
    await expect(app.get(ReadonlyDbService).$queryRawUnsafe('DELETE FROM "LineItem" WHERE false')).rejects.toThrow();
  });

  it('streams authenticated progress followed by the answer', async () => {
    const response = await fetch(`${await app.getUrl()}/assistant/stream?question=${encodeURIComponent('How much do we spend?')}`, { headers: { authorization: `Bearer ${token}` } });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = await response.text();
    expect(events).toContain('event: progress');
    expect(events).toContain('event: result');
    expect(events).toContain('"status":"answered"');
  });

  it('refuses unrelated questions and asks for historical-spend clarification', async () => {
    for (const [question, expected] of [['Tell me a joke', 'refused'], ['How much did we spend in 2026?', 'clarification_required']]) {
      const response = await fetch(`${await app.getUrl()}/assistant/ask`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ question }) });
      expect((await response.json() as { status: string }).status).toBe(expected);
    }
  });

  it('persists owner-scoped follow-ups and links to identical ledger results', async () => {
    const prisma = app.get(PrismaService);
    const owners = await prisma.owner.findMany({ take: 2 });
    const ownToken = app.get(AuthService).sign({ sub: owners[0].id, ownerId: owners[0].id, role: 'owner' });
    const foreignToken = app.get(AuthService).sign({ sub: owners[1].id, ownerId: owners[1].id, role: 'owner' });
    const ask = (question: string, conversationId?: string, auth = ownToken) => fetch(`${url}/assistant/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` }, body: JSON.stringify({ question, conversationId }),
    });
    const url = await app.getUrl();
    const first = await (await ask('Which subscriptions renew this month?')).json() as { conversationId: string };
    try {
      expect(first.conversationId).toBeDefined();
      const response = await ask('What about next month?', first.conversationId);
      const body = await response.json() as { status: string; ledgerUrl: string; filters: { ownerId: string }; matchingLineItemIds: string[]; ledger: { aggregates: unknown } };
      expect(body.status).toBe('answered');
      expect(body.filters.ownerId).toBe(owners[0].id);
      const ledgerResponse = await fetch(`${url}/line-items?${body.ledgerUrl.split('?')[1]}`, { headers: { authorization: `Bearer ${ownToken}` } });
      const ledger = await ledgerResponse.json() as { items: Array<{ id: string }>; aggregates: unknown };
      expect(ledger.items.map((item) => item.id)).toEqual(body.matchingLineItemIds);
      expect(ledger.aggregates).toEqual(body.ledger.aggregates);
      expect((await ask('What about next month?', first.conversationId, foreignToken)).status).toBe(404);
    } finally {
      if (first.conversationId) await prisma.assistantConversation.delete({ where: { id: first.conversationId } });
    }
  });
});
