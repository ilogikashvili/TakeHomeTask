import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AskController } from './ask.controller';
import { AssistantService } from './assistant.service';
import { LineItemsModule } from '../line-items/line-items.module';
import { QueryAuditRepository } from './audit/query-audit.repository';
import { GeminiService } from './gemini.service';

@Module({
	imports: [LineItemsModule],
	controllers: [AssistantController, AskController],
	providers: [AssistantService, QueryAuditRepository, GeminiService],
})
export class AssistantModule {}
