import { isMutationRequest } from '../../src/assistant/assistant.service';

describe('assistant safety', () => {
  it.each([
    'delete the Microsoft contract',
    'update the owner for this item',
    'drop the contracts table',
    'grant access to the database',
  ])('rejects mutation-shaped requests: %s', (question) => {
    expect(isMutationRequest(question)).toBe(true);
  });

  it('allows read-only financial questions', () => {
    expect(isMutationRequest('How much do we spend on software?')).toBe(false);
  });
});