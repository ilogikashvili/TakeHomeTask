import { decodeCursor } from '../common/pagination/keyset-pagination.util';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { LedgerQueryDto, LedgerSortField, SortDirection } from './dto/ledger-query.dto';

export interface WhereClause {
  sql: string;
  params: unknown[];
}

interface CursorValue {
  value: string | number | null;
  id: string;
}

const sortColumns: Record<LedgerSortField, string> = {
  [LedgerSortField.AMOUNT]: 'li."amount"',
  [LedgerSortField.VENDOR]: 'v."name"',
  [LedgerSortField.RENEWAL_DATE]: 'COALESCE(li."renewalDate", DATE \'9999-12-31\')',
  [LedgerSortField.START_DATE]: 'li."startDate"',
  [LedgerSortField.CATEGORY]: 'li."category"',
  [LedgerSortField.STATUS]: 'li."status"',
};

function addParameter(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

export function buildWhereClause(query: LedgerQueryDto = new LedgerQueryDto()): WhereClause {
  if (query.minAmount !== undefined && query.maxAmount !== undefined && query.minAmount > query.maxAmount) {
    throw new BadRequestException('minAmount cannot exceed maxAmount');
  }
  if (query.renewalFrom && query.renewalTo && query.renewalFrom > query.renewalTo) {
    throw new BadRequestException('renewalFrom cannot exceed renewalTo');
  }
  const params: unknown[] = [];
  const conditions = ['li."deletedAt" IS NULL'];

  if (query.vendorId) conditions.push(`li."vendorId" = ${addParameter(params, query.vendorId)}::uuid`);
  if (query.ownerId) conditions.push(`li."ownerId" = ${addParameter(params, query.ownerId)}::uuid`);
  if (query.category) conditions.push(`li."category" = ${addParameter(params, query.category)}`);
  if (query.status) conditions.push(`li."status" = ${addParameter(params, query.status)}::"LineItemStatus"`);
  if (query.minAmount !== undefined) conditions.push(`li."amount" >= ${addParameter(params, String(query.minAmount))}::numeric`);
  if (query.maxAmount !== undefined) conditions.push(`li."amount" <= ${addParameter(params, String(query.maxAmount))}::numeric`);
  if (query.renewalFrom) conditions.push(`li."renewalDate" >= ${addParameter(params, query.renewalFrom)}::date`);
  if (query.renewalTo) conditions.push(`li."renewalDate" <= ${addParameter(params, query.renewalTo)}::date`);
  if (query.search) {
    const search = `%${query.search.trim()}%`;
    const placeholder = addParameter(params, search);
    conditions.push(`(li."name" ILIKE ${placeholder} OR li."description" ILIKE ${placeholder} OR v."name" ILIKE ${placeholder})`);
  }

  if (query.cursor) {
    let cursor: CursorValue;
    try {
      cursor = z.object({ value: z.union([z.string(), z.number()]), id: z.string().uuid() })
        .parse(JSON.parse(decodeCursor(query.cursor)));
      const sort = query.sort ?? LedgerSortField.RENEWAL_DATE;
      if (sort === LedgerSortField.AMOUNT && !/^\d+(\.\d+)?$/.test(String(cursor.value))) throw new Error();
      if ((sort === LedgerSortField.START_DATE || sort === LedgerSortField.RENEWAL_DATE)
        && (!/^\d{4}-\d{2}-\d{2}$/.test(String(cursor.value)) || Number.isNaN(Date.parse(String(cursor.value))))) throw new Error();
      if (sort === LedgerSortField.STATUS && !['DRAFT', 'ACTIVE', 'PENDING_APPROVAL', 'TERMINATED'].includes(String(cursor.value))) throw new Error();
    } catch {
      throw new BadRequestException('Invalid ledger cursor');
    }
    const column = sortColumns[query.sort ?? LedgerSortField.RENEWAL_DATE];
    const operator = query.direction === SortDirection.DESC ? '<' : '>';
    const sort = query.sort ?? LedgerSortField.RENEWAL_DATE;
    const valuePlaceholder = addParameter(params, cursor.value);
    const typedValuePlaceholder = sort === LedgerSortField.RENEWAL_DATE || sort === LedgerSortField.START_DATE
      ? `${valuePlaceholder}::date`
      : sort === LedgerSortField.AMOUNT
        ? `${valuePlaceholder}::numeric`
        : sort === LedgerSortField.STATUS
          ? `${valuePlaceholder}::"LineItemStatus"`
        : valuePlaceholder;
    const idPlaceholder = addParameter(params, cursor.id);
    conditions.push(`(${column} ${operator} ${typedValuePlaceholder} OR (${column} = ${typedValuePlaceholder} AND li."id" ${operator} ${idPlaceholder}::uuid))`);
  }

  return { sql: conditions.join(' AND '), params };
}

export function buildOrderBy(sort: LedgerSortField, direction: SortDirection): string {
  const column = sortColumns[sort];
  if (!column) throw new Error('Unsupported ledger sort field');
  const nulls = sort === LedgerSortField.RENEWAL_DATE ? ' NULLS LAST' : '';
  return `${column} ${direction.toUpperCase()}${nulls}, li."id" ${direction.toUpperCase()}`;
}
