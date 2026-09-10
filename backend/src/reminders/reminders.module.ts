import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { RemindersRepository } from './reminders.repository';
import { ReminderScannerService } from './reminder-scanner.service';
import { RemindersGateway } from './reminders.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [AuthModule],
	controllers: [RemindersController],
	providers: [RemindersService, RemindersRepository, ReminderScannerService, RemindersGateway],
})
export class RemindersModule {}
