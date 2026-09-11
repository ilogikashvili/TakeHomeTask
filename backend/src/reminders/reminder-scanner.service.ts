import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RemindersService } from './reminders.service';

@Injectable()
export class ReminderScannerService implements OnApplicationBootstrap {
	constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {}

	async onApplicationBootstrap(): Promise<void> {
		await this.scan();
	}

	@Cron(CronExpression.EVERY_MINUTE)
	async scan(): Promise<void> {
		const windowStart = new Date();
		const windowEnd = new Date(windowStart);
		windowEnd.setUTCDate(windowEnd.getUTCDate() + 30);
		await this.reminders.sweep(windowStart, windowEnd);
	}
}
