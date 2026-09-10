import { buildWhereClause } from '../../src/line-items/where-clause.builder';
import { LedgerQueryDto } from '../../src/line-items/dto/ledger-query.dto';

describe('where clause builder', () => {
  it('always excludes soft-deleted rows', () => {
    expect(buildWhereClause(new LedgerQueryDto()).sql).toContain('li."deletedAt" IS NULL');
  });

  it('parameterizes filters instead of interpolating values', () => {
    const query = new LedgerQueryDto();
    query.search = "vendor' OR TRUE --";
    const where = buildWhereClause(query);
    expect(where.sql).toContain('$1');
    expect(where.params).toEqual(["%vendor' OR TRUE --%"]);
  });
});
