import { Module } from '@nestjs/common';
import { LineItemsController } from './line-items.controller';
import { LineItemsService } from './line-items.service';
import { LineItemsRepository } from './line-items.repository';

@Module({
	controllers: [LineItemsController],
	providers: [LineItemsService, LineItemsRepository],
	exports: [LineItemsService],
})
export class LineItemsModule {}
