import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/database/prisma.service';
import { ReadonlyDbService } from '../../src/database/readonly-db.service';
import { AuthService } from '../../src/auth/auth.service';
import { LineItemsRepository } from '../../src/line-items/line-items.repository';
import { LedgerQueryDto } from '../../src/line-items/dto/ledger-query.dto';
import { RemindersRepository } from '../../src/reminders/reminders.repository';
import { RetentionService, UsageGuard } from '../../src/operations';

describe('fresh deployment database privilege contract', () => {
  const backendRoot = join(__dirname, '../..');
  const tlsTest = process.env.ROLE_TEST_TLS === 'true' ? it : it.skip;
  let app: INestApplication;
  let owner: PrismaClient;
  let runtime: Pool;
  let readonly: Pool;
  let admin: Pool;
  let ownerId: string;
  let otherId: string;
  let vendorId: string;
  let token: string;
  let base: string;

  beforeAll(async () => {
    if (!process.env.ROLE_TEST_OWNER_URL) throw new Error('Use npm run test:roles against a fresh local cluster');
    owner = new PrismaClient({ datasources: { db: { url: process.env.ROLE_TEST_OWNER_URL } } });
    runtime = new Pool({ connectionString: process.env.ROLE_TEST_PG_RUNTIME_URL || process.env.DATABASE_URL });
    readonly = new Pool({ connectionString: process.env.READONLY_DATABASE_URL, max: 1 });
    admin = new Pool({ connectionString: process.env.ROLE_TEST_PG_OWNER_URL || process.env.ROLE_TEST_OWNER_URL });
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0);
    base = await app.getUrl();
    [ownerId, otherId] = (await owner.owner.findMany({ take: 2 })).map(row => row.id);
    vendorId = (await owner.vendor.findFirstOrThrow()).id;
    token = app.get(AuthService).sign({ sub: ownerId, ownerId, role: 'admin' });
  });

  afterAll(async () => {
    await app?.close();
    await owner?.$disconnect();
    await Promise.all([runtime?.end(), readonly?.end(), admin?.end()]);
  });
  const request = (method: string, path: string, body?: object) => fetch(base + path, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  tlsTest('uses TLS for migration-owner, runtime Prisma and actual readonly executor connections', async () => {
    for (const pool of [admin, runtime, readonly]) {
      expect((await pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl).toBe(true);
    }
    expect((await owner.$queryRaw<Array<{ ssl: boolean }>>`SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()`)[0].ssl).toBe(true);
    expect((await app.get(PrismaService).$queryRaw<Array<{ ssl: boolean }>>`SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()`)[0].ssl).toBe(true);
    expect((await app.get(ReadonlyDbService).$queryRawUnsafe<Array<{ ssl: boolean }>>('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()'))[0].ssl).toBe(true);
  });

  tlsTest('rejects plaintext for owner and both application roles, and rejects an untrusted CA', async () => {
    for (const value of [process.env.ROLE_TEST_PG_OWNER_URL, process.env.ROLE_TEST_PG_RUNTIME_URL, process.env.READONLY_DATABASE_URL]) {
      const url = new URL(value!);
      url.search = '?sslmode=disable';
      const plain = new Pool({ connectionString: url.href });
      try { await expect(plain.query('SELECT 1')).rejects.toMatchObject({ code: '28000' }); }
      finally { await plain.end(); }
    }
    const badPgUrl = new URL(process.env.READONLY_DATABASE_URL!);
    badPgUrl.searchParams.set('sslrootcert', process.env.TLS_TEST_UNTRUSTED_CA!);
    const badPg = new Pool({ connectionString: badPgUrl.href });
    try { await expect(badPg.query('SELECT 1')).rejects.toThrow(/certificate|issuer/i); }
    finally { await badPg.end(); }
    const badPrismaUrl = new URL(process.env.DATABASE_URL!);
    badPrismaUrl.searchParams.set('sslcert', process.env.TLS_TEST_UNTRUSTED_CA!);
    const badPrisma = new PrismaClient({ datasources: { db: { url: badPrismaUrl.href } } });
    try { await expect(badPrisma.$connect()).rejects.toThrow(); }
    finally { await badPrisma.$disconnect(); }
  });

  tlsTest('starts the compiled production application and answers through its TLS readonly connection', async () => {
    const reservation = createServer();
    await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
    const child = spawn(process.execPath, [join(backendRoot, 'dist/src/main.js')], {
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port) }, windowsHide: true, stdio: 'ignore',
    });
    let spawnFailed = false;
    child.on('error', () => { spawnFailed = true; });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (spawnFailed || child.exitCode !== null) throw new Error('Compiled production startup failed');
        try { ready = (await fetch(`http://127.0.0.1:${port}/health/ready`, { signal: AbortSignal.timeout(500) })).ok; } catch { /* Wait for startup. */ }
        if (ready) break;
        await delay(100);
      }
      expect(ready).toBe(true);
      const response = await fetch(`http://127.0.0.1:${port}/assistant/ask`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'How much do we spend?' }), signal: AbortSignal.timeout(10000),
      });
      expect(response.status).toBe(201);
      expect((await response.json() as { status: string }).status).toBe('answered');
      expect((await fetch(`http://127.0.0.1:${port}/auth/demo/owners`)).status).toBe(404);
    } finally {
      if (child.exitCode === null && !spawnFailed) {
        const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
        child.kill();
        await exited;
      }
    }
  });

  it('uses restricted identities without ownership, membership or elevated attributes', async () => {
    expect((await runtime.query('SELECT current_user')).rows[0].current_user).toBe('ledger_runtime');
    expect((await readonly.query('SELECT current_user')).rows[0].current_user).toBe('ledger_readonly');
    expect((await app.get(PrismaService).$queryRaw<Array<{ current_user: string }>>`SELECT current_user`)[0].current_user).toBe('ledger_runtime');
    const roles = await admin.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname IN ('ledger_runtime','ledger_readonly')");
    for (const role of roles.rows) expect(Object.values(role)).toEqual([false, false, false, false, false]);
    expect((await admin.query("SELECT 1 FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('ledger_runtime','ledger_readonly'))")).rowCount).toBe(0);
    expect((await admin.query("SELECT 1 FROM pg_class WHERE relowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('ledger_runtime','ledger_readonly'))")).rowCount).toBe(0);
  });

  it('supports HTTP creation, approval, updates, ledger/export, audit and soft deletion', async () => {
    const response = await request('POST', '/line-items', { ownerId, vendorId, name: 'Role contract', category: 'software', description: 'role search', amount: 12.5, billingPeriod: 'MONTHLY', startDate: '2040-01-01', endDate: '2041-01-01', renewalDate: '2041-01-01' });
    expect(response.status).toBe(201);
    const item = await response.json() as { id: string };
    expect((await request('PATCH', '/line-items/' + item.id, { actorId: ownerId, expectedVersion: 1, status: 'ACTIVE' })).status).toBe(200);
    expect((await request('PATCH', '/line-items/' + item.id, { actorId: ownerId, expectedVersion: 2, name: 'Updated role contract', amount: 13 })).status).toBe(200);
    expect((await request('GET', '/line-items?search=role')).status).toBe(200);
    expect((await request('GET', '/vendors')).status).toBe(200);
    expect((await request('GET', '/owners')).status).toBe(200);
    expect((await request('GET', '/line-items/' + item.id + '/approvals')).status).toBe(200);
    const csv = await request('GET', '/line-items/export');
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain(item.id);
    expect(await owner.approvalEvent.count({ where: { lineItemId: item.id } })).toBe(3);
    expect((await request('DELETE', '/line-items/' + item.id + '?expectedVersion=3')).status).toBe(200);
    expect((await owner.lineItem.findUniqueOrThrow({ where: { id: item.id } })).deletedAt).not.toBeNull();
  });

  it('supports reminder creation, idempotency, ownership transfer and dismissal', async () => {
    const repo = app.get(LineItemsRepository);
    const reminders = app.get(RemindersRepository);
    const item = await repo.create({ ownerId, vendorId, name: 'Reminder role contract', description: 'Role test', category: 'software', amount: 3, billingPeriod: 'MONTHLY', startDate: '2040-01-01', endDate: '2041-01-01', renewalDate: '2041-01-01' }, ownerId);
    await repo.updateWithApproval(item.id, { actorId: ownerId, expectedVersion: 1, status: 'ACTIVE' });
    const date = new Date('2041-01-01');
    await reminders.sweep(date, date);
    expect(await reminders.sweep(date, date)).toEqual([]);
    await repo.updateWithApproval(item.id, { actorId: ownerId, expectedVersion: 2, ownerId: otherId });
    const notifications = await reminders.findUnread(otherId);
    const notification = notifications.find(row => row.reminder?.lineItemId === item.id)!;
    expect(notification).toBeDefined();
    expect((await reminders.dismiss(notification.id, otherId)).count).toBe(1);
    expect((await owner.reminder.findUniqueOrThrow({ where: { id: notification.reminderId! } })).dismissedAt).not.toBeNull();
  });

  it('supports assistant aggregates, column filters, conversation continuation and audit persistence', async () => {
    const first = await request('POST', '/assistant/ask', { question: 'Which subscriptions renew this month?' });
    expect(first.status).toBe(201);
    const body = await first.json() as { status: string; conversationId: string };
    expect(body.status).toBe('answered');
    const next = await request('POST', '/assistant/ask', { question: 'What about next month?', conversationId: body.conversationId });
    expect((await next.json() as { status: string }).status).toBe('answered');
    expect(await owner.assistantMessage.count({ where: { conversationId: body.conversationId } })).toBe(4);
    expect((await request('GET', '/ops/audits')).status).toBe(200);
    await app.get(LineItemsRepository).withSnapshot(true, async db => {
      await app.get(LineItemsRepository).findPage({ ...new LedgerQueryDto(), search: 'role', ownerId, vendorId, category: 'software', minAmount: 0, maxAmount: 100 }, true, db);
      await app.get(LineItemsRepository).findAggregates({ ...new LedgerQueryDto(), search: 'role' }, true, db);
    });
  });

  it('supports quota upserts, repeated logout and retention including message cascade', async () => {
    await app.get(UsageGuard).consume('role-contract', 60, 100);
    await app.get(UsageGuard).consume('role-contract', 60, 100);
    const auth = app.get(AuthService);
    const session = auth.sign({ sub: ownerId, ownerId, role: 'owner' });
    await auth.revoke(session);
    await auth.revoke(session);
    await expect(auth.authenticate(session)).rejects.toThrow('Session revoked');
    const old = new Date('2000-01-01');
    const conversation = await owner.assistantConversation.create({ data: { ownerId, updatedAt: old, messages: { create: { role: 'user', content: 'expired' } } } });
    const audit = await owner.queryAudit.create({ data: { question: 'expired', resolvedIntent: {}, createdAt: old } });
    await owner.usageBucket.create({ data: { key: 'expired-role-contract', count: 1, expiresAt: old } });
    await owner.revokedToken.update({ where: { id: auth.metadata(session).jti }, data: { expiresAt: old } });
    await new RetentionService(app.get(PrismaService), new ConfigService({ RETENTION_ENABLED: true, RETENTION_DAYS: 90 })).prune();
    expect(await owner.assistantConversation.findUnique({ where: { id: conversation.id } })).toBeNull();
    expect(await owner.assistantMessage.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await owner.queryAudit.findUnique({ where: { id: audit.id } })).toBeNull();
    expect(await owner.usageBucket.findUnique({ where: { key: 'expired-role-contract' } })).toBeNull();
    expect(await owner.revokedToken.findUnique({ where: { id: auth.metadata(session).jti } })).toBeNull();
  });

  it('denies unnecessary runtime operations at the SQL boundary', async () => {
    for (const sql of [
      'CREATE TABLE public.forbidden (id int)', 'CREATE SCHEMA forbidden', 'CREATE TEMP TABLE forbidden (id int)',
      'CREATE ROLE forbidden', 'SET ROLE postgres', 'ALTER TABLE "LineItem" ADD COLUMN forbidden int',
      'TRUNCATE "QueryAudit"', 'DELETE FROM "LineItem" WHERE false',
      'UPDATE "ApprovalEvent" SET note = note WHERE false', 'DELETE FROM "ApprovalEvent" WHERE false',
      'INSERT INTO "Owner" DEFAULT VALUES', 'UPDATE "Vendor" SET name = name WHERE false',
      'UPDATE "LineItem" SET "vendorId" = "vendorId" WHERE false',
      'UPDATE "UsageBucket" SET "expiresAt" = "expiresAt" WHERE false',
      'SELECT "normalizedName" FROM "Vendor"',
      'DELETE FROM "AssistantMessage" WHERE false', 'SELECT * FROM "_prisma_migrations"',
    ]) await expect(runtime.query(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('denies readonly writes and protected reads even after disabling read-only transactions', async () => {
    const connection = await readonly.connect();
    try {
    await connection.query('SET default_transaction_read_only = off');
    expect((await connection.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('off');
    for (const sql of [
      'INSERT INTO "LineItem" DEFAULT VALUES', 'UPDATE "LineItem" SET name = name WHERE false',
      'DELETE FROM "LineItem" WHERE false', 'TRUNCATE "LineItem"',
      'SELECT * FROM "Owner"', 'SELECT * FROM "QueryAudit"', 'SELECT * FROM "AssistantConversation"',
      'SELECT * FROM "AssistantMessage"', 'SELECT * FROM "RevokedToken"', 'SELECT * FROM "UsageBucket"',
      'SELECT * FROM "ApprovalEvent"', 'SELECT * FROM "Reminder"', 'SELECT * FROM "Notification"',
      'SELECT * FROM "_prisma_migrations"', 'SELECT "createdAt" FROM "LineItem"',
      'SELECT "category" FROM "Vendor"', 'CREATE TEMP TABLE forbidden (id int)', 'SET ROLE ledger_runtime',
    ]) await expect(connection.query(sql)).rejects.toMatchObject({ code: '42501' });
    } finally {
      await connection.query('SET default_transaction_read_only = on');
      connection.release();
    }
  });

  it('removes legacy table/column/default grants and denies future tables and sequences', async () => {
    await admin.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO ledger_runtime; GRANT SELECT ON ALL TABLES IN SCHEMA public TO ledger_readonly; GRANT SELECT ("email") ON "Owner" TO ledger_readonly; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ledger_readonly; ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO ledger_runtime');
    await admin.query(readFileSync(join(backendRoot, 'scripts/runtime-grants.sql'), 'utf8'));
    await admin.query('CREATE TABLE "FutureProtected" (id serial primary key, secret text)');
    for (const pool of [runtime, readonly]) {
      await expect(pool.query('SELECT * FROM "FutureProtected"')).rejects.toMatchObject({ code: '42501' });
      await expect(pool.query('SELECT last_value FROM "FutureProtected_id_seq"')).rejects.toMatchObject({ code: '42501' });
    }
    await expect(readonly.query('SELECT email FROM "Owner"')).rejects.toMatchObject({ code: '42501' });
    await expect(runtime.query('DELETE FROM "LineItem" WHERE false')).rejects.toMatchObject({ code: '42501' });
  });

  it('matches the entire effective table and column permission matrix', async () => {
    const insert = ['LineItem', 'ApprovalEvent', 'Reminder', 'Notification', 'QueryAudit', 'AssistantConversation', 'AssistantMessage', 'RevokedToken', 'UsageBucket'];
    const remove = ['QueryAudit', 'AssistantConversation', 'RevokedToken', 'UsageBucket'];
    const update: Record<string, string[]> = {
      LineItem: ['ownerId', 'name', 'category', 'description', 'billingPeriod', 'amount', 'startDate', 'endDate', 'renewalDate', 'status', 'version', 'deletedAt', 'updatedAt'],
      Reminder: ['ownerId', 'dismissedAt'], Notification: ['ownerId', 'readAt'], AssistantConversation: ['updatedAt'], UsageBucket: ['count'],
    };
    const ro: Record<string, string[]> = {
      LineItem: ['id', 'version', 'vendorId', 'ownerId', 'name', 'category', 'status', 'billingPeriod', 'amount', 'startDate', 'endDate', 'renewalDate', 'deletedAt', 'description'],
      Vendor: ['id', 'name'],
    };
    const columns = await admin.query<{ table: string; column: string; oid: number; attnum: number }>(`SELECT c.relname AS table, a.attname AS column, c.oid, a.attnum
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped`);
    for (const column of columns.rows) {
      for (const role of ['ledger_runtime', 'ledger_readonly']) {
        const read = role === 'ledger_readonly' ? (ro[column.table] ?? []).includes(column.column)
          : column.table === 'Vendor' ? ['id', 'name', 'category'].includes(column.column)
            : ['Owner', ...insert].includes(column.table);
        const write = role === 'ledger_runtime';
        const permissions = (await admin.query(`SELECT has_column_privilege($1,$2::oid,$3::smallint,'SELECT') AS read,
          has_column_privilege($1,$2::oid,$3::smallint,'INSERT') AS insert, has_column_privilege($1,$2::oid,$3::smallint,'UPDATE') AS update,
          has_column_privilege($1,$2::oid,$3::smallint,'REFERENCES') AS references,
          has_table_privilege($1,$2::oid,'DELETE') AS delete, has_table_privilege($1,$2::oid,'TRUNCATE') AS truncate,
          has_table_privilege($1,$2::oid,'TRIGGER') AS trigger, has_table_privilege($1,$2::oid,'MAINTAIN') AS maintain`, [role, column.oid, column.attnum])).rows[0];
        expect({ role, table: column.table, column: column.column, ...permissions }).toEqual({
          role, table: column.table, column: column.column, read,
          insert: write && insert.includes(column.table), update: write && (update[column.table] ?? []).includes(column.column),
          delete: write && remove.includes(column.table), references: false, truncate: false, trigger: false, maintain: false,
        });
      }
    }
  });

  it('fails the grant phase when an existing runtime identity is elevated', async () => {
    const connection = await admin.connect();
    try {
      await connection.query('ALTER ROLE ledger_runtime CREATEDB');
      await expect(connection.query(readFileSync(join(backendRoot, 'scripts/runtime-grants.sql'), 'utf8')))
        .rejects.toThrow('Restricted role bootstrap required');
    } finally {
      await connection.query('ROLLBACK');
      await connection.query('ALTER ROLE ledger_runtime NOCREATEDB');
      connection.release();
    }
  });
});
