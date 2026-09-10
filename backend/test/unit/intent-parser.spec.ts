import { intentSchema, parseIntent, renewalWindow, vendorCandidates } from '../../src/assistant/graph/intent-parser';

describe('assistant intent and entity resolution', () => {
  it('refuses unrelated requests and validates provider output', () => {
    expect(parseIntent('Tell me a joke').intent).toBe('unsupported');
    expect(() => intentSchema.parse({ intent: 'vendor_spend', sql: 'SELECT * FROM owners' })).toThrow();
    expect(() => intentSchema.parse({ intent: 'vendor_spend', ownerId: 'foreign-owner' })).toThrow();
  });
  it('extracts annualization and explicit vendor names', () => {
    expect(parseIntent('How much do we spend on Microsoft annually?')).toMatchObject({ vendorText: 'Microsoft', annualize: true });
  });
  it('handles month/year rollover and leap years in UTC', () => {
    expect(renewalWindow({ intent: 'renewal_summary', annualize: false, period: 'next_month' }, new Date('2026-12-20')))
      .toEqual({ renewalFrom: '2027-01-01', renewalTo: '2027-01-31' });
    expect(renewalWindow({ intent: 'renewal_summary', annualize: false, period: 'this_month' }, new Date('2028-02-20')))
      .toEqual({ renewalFrom: '2028-02-01', renewalTo: '2028-02-29' });
  });
  it('resolves spacing, preserves ambiguity, and returns typo candidates', () => {
    const vendors = [{ id: '1', name: 'Microsoft' }, { id: '2', name: 'Microsoft Azure' }];
    expect(vendorCandidates('micro soft', vendors)).toEqual([vendors[0]]);
    expect(vendorCandidates('micro', vendors)).toHaveLength(2);
    expect(vendorCandidates('microsft', vendors)).toEqual([vendors[0]]);
    expect(vendorCandidates('unknown', vendors)).toEqual([]);
  });
});
