import { LedgerQueryDto, LedgerStatus } from '../../../line-items/dto/ledger-query.dto';
import { renewalWindow } from '../intent-parser';
import { AssistantState } from '../state';

export function planNode(state: AssistantState): Partial<AssistantState> {
  const { intent } = state;
  if (!intent) {
    return {};
  }

  const query = Object.assign(new LedgerQueryDto(), renewalWindow(intent));

  if (intent.intent === 'renewal_summary') {
    query.status = LedgerStatus.ACTIVE;
  } else if (!query.status && (intent.category || intent.vendorText || intent.annualize || intent.amountMin !== undefined || intent.amountMax !== undefined || intent.period)) {
    query.status = LedgerStatus.ACTIVE;
  }

  if (intent.category) query.category = intent.category;
  if (intent.amountMin !== undefined) query.minAmount = intent.amountMin;
  if (intent.amountMax !== undefined) query.maxAmount = intent.amountMax;
  if (state.selectedVendorId) query.vendorId = state.selectedVendorId;

  const normalizedQuery = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null));
  const operation = intent.intent === 'services_increase' ? 'comparison' : intent.intent === 'renewal_summary' || intent.intent === 'unapproved_renewals' ? 'renewal_lookup' : 'aggregate';

  return {
    query: normalizedQuery as Partial<LedgerQueryDto>,
    ledgerQuery: normalizedQuery,
    queryPlan: {
      operation,
      name: intent.intent,
      filters: normalizedQuery,
      queryCount: operation === 'comparison' ? 2 : 1,
      stages: operation === 'comparison'
        ? ['resolve_entities', 'plan_queries', 'query_1', 'query_2', 'calculate_results', 'build_evidence']
        : ['resolve_entities', 'plan_queries', 'query_1', 'calculate_results', 'build_evidence'],
      evidenceRequired: true,
    },
    executionStages: operation === 'comparison'
      ? ['resolve_entities', 'plan_queries', 'query_1', 'query_2', 'calculate_results', 'build_evidence']
      : ['resolve_entities', 'plan_queries', 'query_1', 'calculate_results', 'build_evidence'],
    evidence: {
      query: normalizedQuery,
      intent: intent.intent,
      summary: intent.intent === 'renewal_summary' ? 'Query plans a renewal-window audit.' : 'Query plans a normalized ledger filter set.',
    },
  };
}
