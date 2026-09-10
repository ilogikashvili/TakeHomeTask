import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './database/prisma.module';
import { AssistantModule } from './assistant/assistant.module';
import { HealthController } from './health/health.controller';
import { LineItemsModule } from './line-items/line-items.module';
import { RemindersModule } from './reminders/reminders.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { CatalogController } from './catalog.controller';
import { OperationalMetrics, OperationsController, RetentionService, UsageGuard } from './operations';

@Module({
  imports: [ConfigModule, PrismaModule, ScheduleModule.forRoot(), AuthModule, LineItemsModule, RemindersModule, AssistantModule],
  controllers: [HealthController, CatalogController, OperationsController],
  providers: [OperationalMetrics, RetentionService, UsageGuard, { provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_GUARD, useExisting: UsageGuard }],
})
export class AppModule {}
