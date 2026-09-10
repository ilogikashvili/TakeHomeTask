import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QueryExecutor, ReadonlyDbService } from '../database/readonly-db.service';
import { encodeCursor } from '../common/pagination/keyset-pagination.util';
import { CreateLineItemDto } from './dto/create-line-item.dto';
import { UpdateLineItemDto } from './dto/update-line-item.dto';
import { LedgerQueryDto, LedgerSortField, SortDirection } from './dto/ledger-query.dto';
import { buildOrderBy, buildWhereClause } from './where-clause.builder';
import { validateLineItemInvariants } from './line-item-invariants';
import { BulkAction, BulkActionDto } from './dto/bulk-action.dto';
import { ConflictException, NotFoundException } from '@nestjs/common';

export interface LedgerRow {
	id: string;
	version: number;
	vendorId: string;
	vendorName: string;
	ownerId: string;
	name: string;
	category: string;
	status: string;
	billingPeriod: string;
	amount: string;
	startDate: Date;
	endDate: Date;
	renewalDate: Date | null;
}

export interface LedgerAggregates {
	totalAmount: string;
	annualizedAmount: string;
	matchingCount: number;
	byVendor: Array<{ vendorId: string; vendorName: string; totalAmount: string; matchingCount: number }>;
	byCategory: Array<{ category: string; totalAmount: string; matchingCount: number }>;
}

@Injectable()
export class LineItemsRepository {
	constructor(private readonly prisma: PrismaService, private readonly readonlyDb: ReadonlyDbService) {}

	create(dto: CreateLineItemDto, actorId: string) {
		validateLineItemInvariants(dto);
		return this.prisma.$transaction(async tx => {
		const item = await tx.lineItem.create({
			data: {
				vendorId: dto.vendorId,
				ownerId: dto.ownerId,
				name: dto.name,
				category: dto.category,
				description: dto.description,
				billingPeriod: dto.billingPeriod,
				amount: new Prisma.Decimal(dto.amount),
				startDate: new Date(dto.startDate),
				endDate: new Date(dto.endDate),
				renewalDate: dto.renewalDate ? new Date(dto.renewalDate) : null,
			},
		});
		await tx.approvalEvent.create({ data: { lineItemId: item.id, actorId, action: 'CREATED', toStatus: 'DRAFT' } });
		return item;
		});
	}

	async updateWithApproval(id: string, dto: UpdateLineItemDto, ownerId?: string) {
		return this.prisma.$transaction(async (transaction) => {
			const current = await transaction.lineItem.findUnique({ where: { id } });
			if (!current || current.deletedAt || current.version !== dto.expectedVersion || (ownerId && current.ownerId !== ownerId)) return null;

			validateLineItemInvariants({
				amount: dto.amount ?? Number(current.amount),
				startDate: dto.startDate ?? current.startDate,
				endDate: dto.endDate ?? current.endDate,
				renewalDate: dto.renewalDate === undefined ? current.renewalDate : dto.renewalDate,
			});

			if (!await transaction.owner.findUnique({ where: { id: dto.actorId } })) throw new NotFoundException('Actor not found');
			const data: Prisma.LineItemUncheckedUpdateInput = {
				ownerId: dto.ownerId,
				name: dto.name,
				category: dto.category,
				description: dto.description,
				billingPeriod: dto.billingPeriod,
				amount: dto.amount === undefined ? undefined : new Prisma.Decimal(dto.amount),
				startDate: dto.startDate === undefined ? undefined : new Date(dto.startDate),
				endDate: dto.endDate === undefined ? undefined : new Date(dto.endDate),
				renewalDate: dto.renewalDate === undefined ? undefined : dto.renewalDate === null ? null : new Date(dto.renewalDate),
				status: dto.status,
				version: { increment: 1 },
			};
			const updated = await transaction.lineItem.updateMany({ where: { id, version: dto.expectedVersion }, data });
			if (updated.count !== 1) return null;
			if (dto.ownerId && dto.ownerId !== current.ownerId) {
				await this.transferReminders(transaction, id, dto.ownerId);
			}

			if (dto.status && dto.status !== current.status) {
				await transaction.approvalEvent.create({
					data: {
						lineItemId: id,
						actorId: dto.actorId,
						action: dto.status === 'ACTIVE' ? 'APPROVED' : 'STATUS_CHANGED',
						fromStatus: current.status,
						toStatus: dto.status,
						note: JSON.stringify({ changedFields: Object.keys(dto).filter(key => !['actorId', 'expectedVersion'].includes(key)), previousOwnerId: current.ownerId, ownerId: dto.ownerId }),
					},
				});
			}
			if (!dto.status || dto.status === current.status) await transaction.approvalEvent.create({ data: {
				lineItemId: id, actorId: dto.actorId, action: dto.ownerId && dto.ownerId !== current.ownerId ? 'OWNER_REASSIGNED' : 'UPDATED',
				fromStatus: current.status, toStatus: current.status, note: JSON.stringify({ changedFields: Object.keys(dto).filter(key => !['actorId', 'expectedVersion'].includes(key)), previousOwnerId: current.ownerId, ownerId: dto.ownerId }),
			} });
			return transaction.lineItem.findUnique({ where: { id } });
		});
	}

	async softDelete(id: string, expectedVersion: number, ownerId: string | undefined, actorId: string) {
		return this.prisma.$transaction(async tx => {
			const current = await tx.lineItem.findFirst({ where: { id, deletedAt: null, ...(ownerId ? { ownerId } : {}) } });
			if (!current) throw new NotFoundException('Line item not found');
			if (current.version !== expectedVersion) throw new ConflictException('Line item was changed');
			const result = await tx.lineItem.updateMany({ where: { id, version: expectedVersion, deletedAt: null }, data: { deletedAt: new Date(), version: { increment: 1 } } });
			if (result.count !== 1) throw new ConflictException('Line item was changed');
			await tx.approvalEvent.create({ data: { lineItemId: id, actorId, action: 'DELETED', fromStatus: current.status, toStatus: current.status } });
			return result;
		});
	}

	async bulk(dto: BulkActionDto, ownerId?: string) {
		return this.prisma.$transaction(async (tx) => {
			if (!await tx.owner.findUnique({ where: { id: dto.actorId } })) throw new NotFoundException('Actor not found');
			if (dto.action === BulkAction.REASSIGN && !await tx.owner.findUnique({ where: { id: dto.ownerId } })) throw new NotFoundException('Owner not found');
			// A consistent lock order avoids deadlocks between overlapping batches.
			for (const item of [...dto.items].sort((a, b) => a.id.localeCompare(b.id))) {
				const current = await tx.lineItem.findFirst({ where: { id: item.id, deletedAt: null, ...(ownerId ? { ownerId } : {}) } });
				if (!current || current.version !== item.expectedVersion) throw new ConflictException('A selected item changed or is unavailable; no changes were applied');
				const data = dto.action === BulkAction.DELETE ? { deletedAt: new Date() }
					: dto.action === BulkAction.REASSIGN ? { ownerId: dto.ownerId } : { status: dto.status };
				const result = await tx.lineItem.updateMany({ where: { id: item.id, version: item.expectedVersion, deletedAt: null }, data: { ...data, version: { increment: 1 } } });
				if (result.count !== 1) throw new ConflictException('A selected item changed; no changes were applied');
				if (dto.action === BulkAction.REASSIGN && dto.ownerId !== current.ownerId) {
					await this.transferReminders(tx, item.id, dto.ownerId!);
				}
				await tx.approvalEvent.create({ data: {
					lineItemId: item.id, actorId: dto.actorId,
					action: dto.action === BulkAction.DELETE ? 'DELETED' : dto.action === BulkAction.REASSIGN ? 'OWNER_REASSIGNED'
						: dto.status === 'ACTIVE' ? 'APPROVED' : 'STATUS_CHANGED',
					fromStatus: current.status, toStatus: dto.action === BulkAction.STATUS ? dto.status : current.status,
					note: JSON.stringify({ bulkAction: dto.action, previousOwnerId: current.ownerId, ownerId: dto.ownerId }),
				} });
			}
			return { updatedCount: dto.items.length, ids: dto.items.map((item) => item.id) };
		});
	}

	async withSnapshot<T>(readOnly: boolean, work: (database: QueryExecutor) => Promise<T>): Promise<T> {
		if (readOnly) return this.readonlyDb.withSnapshot(work);
		return this.prisma.$transaction(async tx => {
			await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
			return work(tx);
		}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10000 });
	}

	async findPage(query: LedgerQueryDto, readOnly = false, executor?: QueryExecutor): Promise<{ items: LedgerRow[]; nextCursor: string | null }> {
		const database = executor ?? (readOnly ? this.readonlyDb : this.prisma);
		const where = buildWhereClause(query);
		const orderBy = buildOrderBy(query.sort ?? LedgerSortField.RENEWAL_DATE, query.direction ?? SortDirection.ASC);
		const limit = Math.min(query.limit ?? 25, 100);
		const rows = await database.$queryRawUnsafe<LedgerRow[]>(
			`SELECT li."id", li."version", li."vendorId", v."name" AS "vendorName", li."ownerId", li."name", li."category", li."status", li."billingPeriod", li."amount"::text AS "amount", li."startDate", li."endDate", li."renewalDate"
			 FROM "LineItem" li
			 JOIN "Vendor" v ON v."id" = li."vendorId"
			 WHERE ${where.sql}
			 ORDER BY ${orderBy}
			 LIMIT $${where.params.length + 1}`,
			...where.params,
			limit + 1,
		);
		const hasNextPage = rows.length > limit;
		const items = hasNextPage ? rows.slice(0, limit) : rows;
		const lastItem = items.at(-1);
		const nextCursor = hasNextPage && lastItem
			? encodeCursor(JSON.stringify({ value: this.cursorValue(lastItem, query.sort ?? LedgerSortField.RENEWAL_DATE), id: lastItem.id }))
			: null;
		return { items, nextCursor };
	}

	async findAggregates(query: LedgerQueryDto, readOnly = false, executor?: QueryExecutor): Promise<LedgerAggregates> {
		const database = executor ?? (readOnly ? this.readonlyDb : this.prisma);
		const where = buildWhereClause({ ...query, cursor: undefined });
		const [result] = await database.$queryRawUnsafe<[{ totalAmount: string | null; annualizedAmount: string; matchingCount: bigint }]>(
			`SELECT COALESCE(SUM(li."amount"), 0)::text AS "totalAmount",
			 COALESCE(SUM(li."amount" * CASE li."billingPeriod" WHEN 'WEEKLY' THEN 52 WHEN 'MONTHLY' THEN 12 WHEN 'QUARTERLY' THEN 4 ELSE 1 END), 0)::text AS "annualizedAmount",
			 COUNT(*)::bigint AS "matchingCount"
			 FROM "LineItem" li
			 JOIN "Vendor" v ON v."id" = li."vendorId"
			 WHERE ${where.sql}`,
			...where.params,
		);
		const [byVendor, byCategory] = await Promise.all([
			database.$queryRawUnsafe<LedgerAggregates['byVendor']>(
				`SELECT li."vendorId", v."name" AS "vendorName", SUM(li."amount")::text AS "totalAmount", COUNT(*)::int AS "matchingCount"
				 FROM "LineItem" li JOIN "Vendor" v ON v."id" = li."vendorId" WHERE ${where.sql}
				 GROUP BY li."vendorId", v."name" ORDER BY SUM(li."amount") DESC, li."vendorId"`, ...where.params),
			database.$queryRawUnsafe<LedgerAggregates['byCategory']>(
				`SELECT li."category", SUM(li."amount")::text AS "totalAmount", COUNT(*)::int AS "matchingCount"
				 FROM "LineItem" li JOIN "Vendor" v ON v."id" = li."vendorId" WHERE ${where.sql}
				 GROUP BY li."category" ORDER BY SUM(li."amount") DESC, li."category"`, ...where.params),
		]);
		return { totalAmount: new Prisma.Decimal(result.totalAmount ?? 0).toFixed(2), annualizedAmount: new Prisma.Decimal(result.annualizedAmount).toFixed(2), matchingCount: Number(result.matchingCount), byVendor, byCategory };
	}

	private async transferReminders(tx: Prisma.TransactionClient, lineItemId: string, ownerId: string) {
		await tx.reminder.updateMany({ where: { lineItemId }, data: { ownerId } });
		await tx.notification.updateMany({ where: { reminder: { lineItemId } }, data: { ownerId } });
	}

	private cursorValue(row: LedgerRow, sort: LedgerSortField): string | number | null {
		switch (sort) {
			case LedgerSortField.AMOUNT: return row.amount;
			case LedgerSortField.VENDOR: return row.vendorName;
			case LedgerSortField.RENEWAL_DATE: return row.renewalDate?.toISOString().slice(0, 10) ?? '9999-12-31';
			case LedgerSortField.START_DATE: return row.startDate.toISOString().slice(0, 10);
			case LedgerSortField.CATEGORY: return row.category;
			case LedgerSortField.STATUS: return row.status;
		}
	}
}
