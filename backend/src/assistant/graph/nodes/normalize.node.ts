import { AssistantState } from '../state';
import { parseIntent } from '../intent-parser';

export function normalizeNode(state: AssistantState): Partial<AssistantState> {
  const normalizedQuestion = state.question.trim().replace(/\s+/g, ' ');
  const intent = parseIntent(normalizedQuestion);
  return {
    normalizedQuestion,
    intent,
    status: intent.intent === 'unsupported' ? 'refused' : undefined,
  };
}
