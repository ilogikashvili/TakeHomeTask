import { Body, Controller, Delete, Get, Header, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateLineItemDto } from './dto/create-line-item.dto';
import { LedgerQueryDto } from './dto/ledger-query.dto';
import { LineItemsService } from './line-items.service';
import { UpdateLineItemDto } from './dto/update-line-item.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { BulkActionDto } from './dto/bulk-action.dto';

@Controller('line-items')
export class LineItemsController {
	constructor(private readonly service: LineItemsService) {}

	@Get()
	getLedger(@Query() query: LedgerQueryDto, @CurrentUser() user: AuthUser) {
		return this.service.getLedger(query, user);
	}

	@Post()
	create(@Body() dto: CreateLineItemDto, @CurrentUser() user: AuthUser) {
		return this.service.create(dto, user);
	}

	@Get('export')
	@Header('Content-Type', 'text/csv; charset=utf-8')
	@Header('Content-Disposition', 'attachment; filename="ledger.csv"')
	export(@Query() query: LedgerQueryDto, @CurrentUser() user: AuthUser) {
		return this.service.exportCsv(query, user);
	}

	@Get(':id')
	getDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
		return this.service.getDetail(id, user);
	}

	@Post('bulk')
	bulk(@Body() dto: BulkActionDto, @CurrentUser() user: AuthUser) {
		return this.service.bulk(dto, user);
	}

	@Patch(':id')
	update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLineItemDto, @CurrentUser() user: AuthUser) {
		return this.service.update(id, dto, user);
	}

	@Delete(':id')
	remove(
		@Param('id', ParseUUIDPipe) id: string,
		@Query('expectedVersion', ParseIntPipe) expectedVersion: number,
		@CurrentUser() user: AuthUser,
	) {
		return this.service.remove(id, expectedVersion, user);
	}
}
