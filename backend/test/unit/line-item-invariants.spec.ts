import { BadRequestException } from '@nestjs/common';
import { validateLineItemInvariants } from '../../src/line-items/line-item-invariants';

describe('line-item invariants', () => {
  const valid = {
    amount: 100,
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    renewalDate: '2025-06-01',
  };

  it('accepts a valid line item', () => {
    expect(() => validateLineItemInvariants(valid)).not.toThrow();
  });

  it.each([
    ['negative amount', { ...valid, amount: -1 }],
    ['reversed dates', { ...valid, startDate: '2025-12-31', endDate: '2025-01-01' }],
    ['renewal before start', { ...valid, renewalDate: '2024-12-31' }],
  ])('rejects %s', (_description, input) => {
    expect(() => validateLineItemInvariants(input)).toThrow(BadRequestException);
  });
});