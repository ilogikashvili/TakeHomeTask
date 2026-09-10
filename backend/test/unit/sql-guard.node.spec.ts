import { isSafeSelect } from '../../src/assistant/graph/nodes/sql-guard.node';

describe('SQL guard', () => {
  it.each(['DROP TABLE vendors', 'DELETE FROM vendors', 'UPDATE vendors SET name = \'x\'', 'SELECT 1; DELETE FROM vendors'])('%s is rejected', (sql) => {
    expect(isSafeSelect(sql)).toBe(false);
  });

  it.each(['', '   ', 'INSERT INTO vendors VALUES (1)', 'WITH removed AS (DELETE FROM vendors RETURNING id) SELECT * FROM removed'])('%s is rejected as non-read SQL', (sql) => {
    expect(isSafeSelect(sql)).toBe(false);
  });

  it.each([
    'SELECT 1',
    '  SELECT li.id FROM "LineItem" li WHERE li."status" = $1',
    'SELECT li.id FROM "LineItem" li WHERE li."name" ILIKE $1 ORDER BY li.id',
  ])('%s is accepted as a parameterized read', (sql) => {
    expect(isSafeSelect(sql)).toBe(true);
  });

  it.each(['-- SELECT 1', '/* SELECT 1 */ SELECT 1', 'SELECT 1;'])('%s is rejected when it contains SQL control syntax', (sql) => {
    expect(isSafeSelect(sql)).toBe(false);
  });
});
