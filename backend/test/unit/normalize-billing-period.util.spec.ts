import { Prisma } from '@prisma/client';
import { normalizeToMonthly } from '../../src/common/money/normalize-billing-period.util';

describe('normalizeToMonthly', () => {
  it('keeps monthly amounts unchanged', () => {
    expect(normalizeToMonthly(new Prisma.Decimal(12), 'monthly').toNumber()).toBe(12);
  });
});
