import { Injectable } from '@nestjs/common';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CreateLineItemDto } from './dto/create-line-item.dto';
import { LedgerQueryDto } from './dto/ledger-query.dto';
import { UpdateLineItemDto } from './dto/update-line-item.dto';
import { LineItemsRepository } from './line-items.repository';
import { AuthUser } from '../auth/auth.types';
import { BulkAction, BulkActionDto } from './dto/bulk-action.dto';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class LineItemsService {
	constructor(private readonly repository: LineItemsRepository) {}

	async getLedger(query: LedgerQueryDto, user?: AuthUser, readOnly = false) {
		const scopedQuery = user?.role === 'owner' ? { ...query, ownerId: this.requireOwnerId(user) } : query;
		return this.repository.withSnapshot(readOnly, async database => {
			const [page, aggregates] = await Promise.all([
				this.repository.findPage(scopedQuery, readOnly, database),
				this.repository.findAggregates(scopedQuery, readOnly, database),
			]);
			return { ...page, aggregates };
		});
	}

	async getDetail(id: string, user: AuthUser) {
		const item = await this.repository.findById(id, user.role === 'owner' ? this.requireOwnerId(user) : undefined);
		if (!item) throw new NotFoundException('Line item not found');
		return item;
	}

	create(dto: CreateLineItemDto, user?: AuthUser) {
		if (user?.role === 'owner' && dto.ownerId !== this.requireOwnerId(user)) throw new ForbiddenException('You cannot create data for another owner');
		return this.repository.create(dto, this.actor(user));
	}

	async update(id: string, dto: UpdateLineItemDto, user?: AuthUser) {
		const actorId = this.actor(user, dto.actorId);
		if (user?.role === 'owner' && dto.ownerId && dto.ownerId !== this.requireOwnerId(user)) {
			throw new ForbiddenException('You cannot reassign data to another owner');
		}
		if (user?.role === 'owner' && dto.actorId !== this.requireOwnerId(user)) {
			throw new ForbiddenException('You cannot act as another owner');
		}
		const result = await this.repository.updateWithApproval(id, { ...dto, actorId }, user?.role === 'owner' ? this.requireOwnerId(user) : undefined);
		if (!result) throw new ConflictException('Line item was changed or does not exist');
		return result;
	}

	async remove(id: string, expectedVersion: number, user?: AuthUser) {
		const result = await this.repository.softDelete(id, expectedVersion, user?.role === 'owner' ? this.requireOwnerId(user) : undefined, this.actor(user));
		if (result.count !== 1) throw new NotFoundException('Line item not found');
		return { deleted: true };
	}

	private requireOwnerId(user: AuthUser): string {
		if (!user.ownerId) throw new ForbiddenException('Owner identity is missing from access token');
		return user.ownerId;
	}

	bulk(dto: BulkActionDto, user: AuthUser) {
		const actorId = this.actor(user, dto.actorId);
		if (dto.action === BulkAction.REASSIGN && !dto.ownerId) throw new BadRequestException('ownerId is required for reassignment');
		if (dto.action === BulkAction.STATUS && !dto.status) throw new BadRequestException('status is required for status changes');
		if (user.role === 'owner') {
			if (dto.actorId !== this.requireOwnerId(user)) throw new ForbiddenException('You cannot act as another owner');
			if (dto.action === BulkAction.REASSIGN && dto.ownerId !== user.ownerId) throw new ForbiddenException('You cannot reassign data to another owner');
		}
		return this.repository.bulk({ ...dto, actorId }, user.role === 'owner' ? this.requireOwnerId(user) : undefined);
	}

	private actor(user?: AuthUser, claimed?: string): string {
		if (!user?.ownerId) throw new ForbiddenException('Mutation identity is not mapped to an audit actor');
		if (claimed && claimed !== user.ownerId) throw new ForbiddenException('Audit actor must match the authenticated identity');
		return user.ownerId;
	}

	async exportCsv(query: LedgerQueryDto, user: AuthUser): Promise<string> {
		const scoped = { ...query, cursor: undefined as string | undefined, limit: 100,
			...(user.role === 'owner' ? { ownerId: this.requireOwnerId(user) } : {}) };
		const escape = (value: unknown) => {
			const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '');
			const safe = /^[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
			return '"' + safe.replace(/"/g, '""') + '"';
		};
		return this.repository.withSnapshot(false, async database => {
		const lines = ['id,vendor,ownerId,name,category,status,billingPeriod,amount,startDate,endDate,renewalDate,version'];
		do {
			const page = await this.repository.findPage(scoped, false, database);
			for (const row of page.items) lines.push([row.id, row.vendorName, row.ownerId, row.name, row.category,
				row.status, row.billingPeriod, row.amount, row.startDate, row.endDate, row.renewalDate, row.version].map(escape).join(','));
			if (lines.length > 10001) throw new BadRequestException('Export is limited to 10000 rows; narrow the filters');
			scoped.cursor = page.nextCursor ?? undefined;
		} while (scoped.cursor);
		return lines.join('\r\n') + '\r\n';
		});
	}
}
