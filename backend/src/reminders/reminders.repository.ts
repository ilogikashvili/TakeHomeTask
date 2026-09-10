import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface InsertedReminder {
	id: string;
	ownerId: string;
	lineItemId: string;
	renewalDate: Date;
}

@Injectable()
export class RemindersRepository {
	constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

	async sweep(windowStart: Date, windowEnd: Date): Promise<InsertedReminder[]> {
		return this.prisma.$transaction(async (transaction) => {
		const inserted = await transaction.$queryRaw<InsertedReminder[]>`
			INSERT INTO "Reminder" ("id", "lineItemId", "ownerId", "renewalDate")
			SELECT gen_random_uuid(), li."id", li."ownerId", li."renewalDate"
			FROM "LineItem" li
			WHERE li."status" = 'ACTIVE'
				AND li."deletedAt" IS NULL
				AND li."renewalDate" IS NOT NULL
				AND li."renewalDate" BETWEEN CAST(${windowStart} AS date) AND CAST(${windowEnd} AS date)
			ORDER BY li."id"
			FOR UPDATE OF li
			ON CONFLICT ("lineItemId", "renewalDate") DO NOTHING
			RETURNING "id", "lineItemId", "ownerId", "renewalDate"
		`;

		if (inserted.length > 0) {
			await transaction.notification.createMany({
				data: inserted.map((reminder) => ({
					ownerId: reminder.ownerId,
					reminderId: reminder.id,
					type: 'RENEWAL_REMINDER',
				})),
			});
		}
		return inserted;
		});
	}

	findUnread(ownerId: string) {
		return this.prisma.notification.findMany({
			where: { ownerId, readAt: null, reminder: { dismissedAt: null, lineItem: { deletedAt: null } } },
			orderBy: { createdAt: 'desc' },
			include: { reminder: { include: { lineItem: { select: { name: true } } } } },
		});
	}

	dismiss(notificationId: string, ownerId: string) {
		return this.prisma.$transaction(async (tx) => {
			const result = await tx.notification.updateMany({
				where: { id: notificationId, ownerId, readAt: null },
				data: { readAt: new Date() },
			});
			if (result.count > 0) {
				await tx.reminder.updateMany({
					where: { notifications: { some: { id: notificationId, ownerId } } },
					data: { dismissedAt: new Date() },
				});
			}
			return result;
		});
	}
}
