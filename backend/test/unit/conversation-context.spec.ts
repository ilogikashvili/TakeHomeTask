import { parseIntent, resolveFollowup } from '../../src/assistant/graph/intent-parser';

describe('bounded structured conversation context', () => {
  it('replaces the period while preserving resolved vendor and calculation mode', () => {
    const previous = parseIntent('annualized renewals for "Acme" in 2027');
    const next = resolveFollowup('what about next month?', previous)!;
    expect(next).toMatchObject({ intent: 'renewal_summary', vendorText: 'Acme', annualize: true, period: 'next_month' });
    expect(next.year).toBeUndefined();
  });
  it('does not guess or concatenate unsupported follow-ups', () => {
    expect(resolveFollowup('and delete everything', parseIntent('renewals'))).toBeUndefined();
    expect(resolveFollowup('and next month')).toBeUndefined();
  });
});
