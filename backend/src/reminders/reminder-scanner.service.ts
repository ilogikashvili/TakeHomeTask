import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RemindersService } from './reminders.service';

@Injectable()
export class ReminderScannerService {
	constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {}

	async onApplicationBootstrap(): Promise<void> {
		await this.scan();
	}

	@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
	async scan(): Promise<void> {
		const windowStart = new Date();
		const windowEnd = new Date(windowStart);
		windowEnd.setUTCDate(windowEnd.getUTCDate() + 30);
		await this.reminders.sweep(windowStart, windowEnd);
	}
}
