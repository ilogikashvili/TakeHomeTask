import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { RemindersService } from '../../src/reminders/reminders.service';
import { RemindersRepository } from '../../src/reminders/reminders.repository';
import { Prisma } from '@prisma/client';
import { LineItemsRepository } from '../../src/line-items/line-items.repository';
import { ReminderScannerService } from '../../src/reminders/reminder-scanner.service';

describe('reminders idempotency', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reminders: RemindersService;
  let scanner: ReminderScannerService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    reminders = app.get(RemindersService);
    scanner = app.get(ReminderScannerService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reconciles eligible renewal windows on startup without duplicating reminders', async () => {
    const source = await prisma.lineItem.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const renewalDate = new Date(Date.now() + 10 * 86400000);
    const item = await prisma.lineItem.create({ data: {
      vendorId: source.vendorId,
      ownerId: source.ownerId,
      name: 'Startup sweep fixture',
      category: 'test',
      amount: 1,
      billingPeriod: 'MONTHLY',
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 30 * 86400000),
      renewalDate,
      status: 'ACTIVE',
    } });

    try {
      await scanner.onApplicationBootstrap();
      expect(await prisma.reminder.count({ where: { lineItemId: item.id } })).toBe(1);
      expect(await prisma.notification.count({ where: { reminder: { lineItemId: item.id } } })).toBe(1);

      await scanner.onApplicationBootstrap();
      expect(await prisma.reminder.count({ where: { lineItemId: item.id } })).toBe(1);
      expect(await prisma.notification.count({ where: { reminder: { lineItemId: item.id } } })).toBe(1);
    } finally {
      await prisma.notification.deleteMany({ where: { reminder: { lineItemId: item.id } } });
      await prisma.reminder.deleteMany({ where: { lineItemId: item.id } });
      await prisma.lineItem.delete({ where: { id: item.id } });
    }
  });

  it('inserts one reminder per line item under concurrent scans', async () => {
    const lineItem = await prisma.lineItem.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const originalRenewalDate = lineItem.renewalDate;
    const renewalDate = new Date('2040-01-02T00:00:00.000Z');
    await prisma.reminder.deleteMany({ where: { lineItemId: lineItem.id, renewalDate } });
    await prisma.lineItem.update({ where: { id: lineItem.id }, data: { renewalDate } });

    try {
      const windowStart = new Date('2040-01-01T00:00:00.000Z');
      const windowEnd = new Date('2040-01-03T00:00:00.000Z');
      await Promise.all([reminders.sweep(windowStart, windowEnd), reminders.sweep(windowStart, windowEnd)]);

      const reminderCount = await prisma.reminder.count({ where: { lineItemId: lineItem.id, renewalDate } });
      const notificationCount = await prisma.notification.count({ where: { reminder: { lineItemId: lineItem.id, renewalDate } } });
      expect(reminderCount).toBe(1);
      expect(notificationCount).toBe(1);
    } finally {
      await prisma.notification.deleteMany({ where: { reminder: { lineItemId: lineItem.id, renewalDate } } });
      await prisma.reminder.deleteMany({ where: { lineItemId: lineItem.id, renewalDate } });
      await prisma.lineItem.update({ where: { id: lineItem.id }, data: { renewalDate: originalRenewalDate } });
    }
  });

  it('rolls back reminders when notification persistence fails, then retries safely', async () => {
    const source = await prisma.lineItem.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const date = new Date('2050-01-02T00:00:00.000Z');
    const item = await prisma.lineItem.create({ data: {
      vendorId: source.vendorId, ownerId: source.ownerId, name: 'Rollback fixture', category: source.category,
      amount: 1, billingPeriod: 'ANNUAL', startDate: new Date('2049-01-01'), endDate: new Date('2051-01-01'), renewalDate: date,
    } });
    await prisma.$transaction(async (tx) => {
      await tx.lineItem.update({ where: { id: item.id }, data: { status: 'ACTIVE' } });
      await tx.approvalEvent.create({ data: { lineItemId: item.id, actorId: source.ownerId, action: 'APPROVED', toStatus: 'ACTIVE' } });
    });
    // Run the real database transaction, injecting failure only at notification insertion.
    const failingClient = {
      $transaction: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction(async (tx) => {
        jest.spyOn(tx.notification, 'createMany').mockRejectedValueOnce(new Error('simulated notification failure'));
        return work(tx);
      }),
    } as unknown as PrismaService;
    try {
      await expect(new RemindersRepository(failingClient).sweep(date, date)).rejects.toThrow('simulated notification failure');
      expect(await prisma.reminder.count({ where: { lineItemId: item.id } })).toBe(0);
      await reminders.sweep(date, date);
      await reminders.sweep(date, date);
      expect(await prisma.reminder.count({ where: { lineItemId: item.id } })).toBe(1);
      expect(await prisma.notification.count({ where: { reminder: { lineItemId: item.id } } })).toBe(1);
    } finally {
      await prisma.lineItem.delete({ where: { id: item.id } });
    }
  });

  it('recovers missed reminder state on reconnect from unread persistence', async () => {
    const source = await prisma.lineItem.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const date = new Date('2065-01-02T00:00:00.000Z');
    const item = await prisma.lineItem.create({ data: {
      vendorId: source.vendorId, ownerId: source.ownerId, name: 'Reconnect fixture', category: 'test',
      amount: 1, billingPeriod: 'ANNUAL', startDate: new Date('2064-01-01'), endDate: new Date('2066-01-01'), renewalDate: date,
      status: 'ACTIVE',
    } });

    try {
      const inserted = await reminders.sweep(date, date);
      const notification = await prisma.notification.findFirstOrThrow({
        where: { reminderId: inserted[0].id },
      });

      expect((await app.get(RemindersRepository).findUnread(source.ownerId)).some(row => row.id === notification.id)).toBe(true);

      await reminders.dismiss(notification.id, source.ownerId);
      expect((await app.get(RemindersRepository).findUnread(source.ownerId)).some(row => row.id === notification.id)).toBe(false);
    } finally {
      await prisma.notification.deleteMany({ where: { reminder: { lineItemId: item.id } } });
      await prisma.reminder.deleteMany({ where: { lineItemId: item.id } });
      await prisma.lineItem.delete({ where: { id: item.id } });
    }
  });

  it('keeps a dismissed reminder dismissed after owner reassignment and recreates only on a new renewal date', async () => {
    const source = await prisma.lineItem.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const nextOwner = await prisma.owner.findFirstOrThrow({ where: { id: { not: source.ownerId } } });
    const firstDate = new Date('2066-01-02T00:00:00.000Z');
    const secondDate = new Date('2066-02-02T00:00:00.000Z');
    const item = await prisma.lineItem.create({ data: {
      vendorId: source.vendorId, ownerId: source.ownerId, name: 'Lifecycle fixture', category: 'test',
      amount: 1, billingPeriod: 'MONTHLY', startDate: new Date('2065-01-01'), endDate: new Date('2067-01-01'), renewalDate: firstDate, status: 'ACTIVE',
    } });

    try {
      const firstReminder = await reminders.sweep(firstDate, firstDate);
      const firstNotification = await prisma.notification.findFirstOrThrow({ where: { reminderId: firstReminder[0].id } });
      await reminders.dismiss(firstNotification.id, source.ownerId);

      const repo = app.get(LineItemsRepository);
      await repo.updateWithApproval(item.id, { expectedVersion: 1, actorId: source.ownerId, ownerId: nextOwner.id });

      const reminder = await prisma.reminder.findUniqueOrThrow({ where: { id: firstReminder[0].id } });
      expect(reminder.dismissedAt).not.toBeNull();
      expect((await app.get(RemindersRepository).findUnread(nextOwner.id)).some(notification => notification.reminder?.lineItemId === item.id)).toBe(false);

      await prisma.lineItem.update({ where: { id: item.id }, data: { renewalDate: secondDate } });
      await reminders.sweep(secondDate, secondDate);
      const remaining = await prisma.reminder.findMany({ where: { lineItemId: item.id } });
      expect(remaining.some((row) => row.renewalDate.getTime() === secondDate.getTime())).toBe(true);
    } finally {
      await prisma.notification.deleteMany({ where: { reminder: { lineItemId: item.id } } });
      await prisma.reminder.deleteMany({ where: { lineItemId: item.id } });
      await prisma.lineItem.delete({ where: { id: item.id } });
    }
  });

  it.each(['reassign', 'delete'])('serializes a scanner with %s and leaves no wrongly scoped unread records', async action => {
    const source = await prisma.lineItem.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const nextOwner = await prisma.owner.findFirstOrThrow({ where: { id: { not: source.ownerId } } });
    const date = new Date('2055-01-02');
    const item = await prisma.lineItem.create({ data: { vendorId: source.vendorId, ownerId: source.ownerId, name: 'Race fixture',
      category: 'test', amount: 1, billingPeriod: 'ANNUAL', startDate: new Date('2054-01-01'), endDate: new Date('2056-01-01'), renewalDate: date, status: 'ACTIVE' } });
    let resume!: () => void;
    const barrier = new Promise<void>(resolve => { resume = resolve; });
    let inserted!: () => void;
    const scanned = new Promise<void>(resolve => { inserted = resolve; });
    const paused = { $transaction: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction(async tx => {
      const result = await work(tx); inserted(); await barrier; return result;
    }) } as unknown as PrismaService;
    const scan = new RemindersRepository(paused).sweep(date, date);
    try {
      await scanned;
      const repo = app.get(LineItemsRepository);
      const mutation = action === 'reassign'
        ? repo.updateWithApproval(item.id, { expectedVersion: 1, actorId: source.ownerId, ownerId: nextOwner.id })
        : repo.softDelete(item.id, 1, undefined, source.ownerId);
      resume();
      await Promise.all([scan, mutation]);
      if (action === 'reassign') {
        const reminders = await prisma.reminder.findMany({ where: { lineItemId: item.id }, include: { notifications: true } });
        expect(reminders).toHaveLength(1);
        expect(reminders[0].ownerId).toBe(nextOwner.id);
        expect(reminders[0].notifications.every(notification => notification.ownerId === nextOwner.id)).toBe(true);
      }
      expect((await app.get(RemindersRepository).findUnread(source.ownerId)).some(notification => notification.reminder?.lineItemId === item.id)).toBe(false);
      await reminders.sweep(date, date);
      expect(await prisma.reminder.count({ where: { lineItemId: item.id } })).toBe(1);
    } finally { resume(); await scan; await prisma.lineItem.delete({ where: { id: item.id } }); }
  });
});
