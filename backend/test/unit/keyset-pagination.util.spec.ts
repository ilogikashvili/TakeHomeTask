import { decodeCursor, encodeCursor } from '../../src/common/pagination/keyset-pagination.util';
import { buildOrderBy, buildWhereClause } from '../../src/line-items/where-clause.builder';
import { LedgerQueryDto, LedgerSortField, SortDirection } from '../../src/line-items/dto/ledger-query.dto';

describe('keyset pagination', () => {
  it('round-trips a cursor payload', () => {
    const payload = JSON.stringify({ value: '2025-01-01', id: '00000000-0000-0000-0000-000000000001' });
    expect(decodeCursor(encodeCursor(payload))).toBe(payload);
  });

  it('uses a stable unique tie-breaker for every supported sort', () => {
    for (const sort of Object.values(LedgerSortField)) {
      expect(buildOrderBy(sort, SortDirection.ASC)).toContain('li."id" ASC');
    }
  });

  it('adds cursor predicates to the same filter builder', () => {
    const query = new LedgerQueryDto();
    query.cursor = encodeCursor(JSON.stringify({ value: 'software', id: '00000000-0000-0000-0000-000000000001' }));
    query.sort = LedgerSortField.CATEGORY;
    const where = buildWhereClause(query);
    expect(where.sql).toContain('li."category" >');
    expect(where.params).toHaveLength(2);
  });
});
