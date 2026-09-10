import { Inject, Injectable } from '@nestjs/common';
import { RemindersGateway } from './reminders.gateway';
import { RemindersRepository } from './reminders.repository';

@Injectable()
export class RemindersService {
	constructor(
		@Inject(RemindersRepository) private readonly repository: RemindersRepository,
		@Inject(RemindersGateway) private readonly gateway: RemindersGateway,
	) {}

	unread(ownerId: string) {
		return this.repository.findUnread(ownerId);
	}

	dismiss(notificationId: string, ownerId: string) {
		return this.repository.dismiss(notificationId, ownerId);
	}

	sweep(windowStart: Date, windowEnd: Date) {
		return this.repository.sweep(windowStart, windowEnd).then((inserted) => {
			for (const reminder of inserted) this.gateway.notifyOwner(reminder.ownerId, reminder.id);
			return inserted;
		});
	}
}
