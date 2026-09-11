import { AssistantState } from '../state';

export function answerNode(state: AssistantState): Partial<AssistantState> {
  const { intent } = state;
  if (!intent) {
    return {};
  }

  if (intent.intent === 'unsupported') {
    return {
      status: 'refused',
      answer: 'I support subscription spend totals, vendor/category totals, and renewal summaries.',
      queryPlan: {
        operation: 'refusal',
        name: 'unsupported',
        filters: {},
        queryCount: 0,
        stages: ['resolve_entities', 'validate_request'],
        evidenceRequired: false,
      },
      executionStages: ['resolve_entities', 'validate_request'],
    };
  }

  const summary = state.evidence?.summary || 'Prepared a deterministic ledger query.';
  return {
    status: 'answered',
    answer: `${summary} The work is now ready to execute against the read-only ledger.`,
    queryPlan: state.queryPlan,
    executionStages: state.executionStages || ['resolve_entities', 'plan_queries', 'execute_queries', 'build_evidence'],
  };
}
