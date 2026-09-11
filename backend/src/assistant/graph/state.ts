import { Annotation } from '@langchain/langgraph';
import { ParsedIntent } from './intent-parser';
import { LedgerQueryDto } from '../../line-items/dto/ledger-query.dto';

export interface AssistantLookup {
  id: string;
  name: string;
}

export interface AssistantQueryPlan {
  operation: 'aggregate' | 'comparison' | 'renewal_lookup' | 'refusal';
  name: string;
  filters: Record<string, unknown>;
  queryCount: number;
  stages: string[];
  evidenceRequired: boolean;
}

export interface AssistantState {
  question: string;
  normalizedQuestion?: string;
  intent?: ParsedIntent;
  vendorCatalog?: AssistantLookup[];
  vendorId?: string;
  vendorCandidates?: AssistantLookup[];
  selectedVendorId?: string;
  query?: Partial<LedgerQueryDto>;
  clarificationRequired?: boolean;
  clarificationQuestion?: string;
  ledgerQuery?: Record<string, unknown>;
  queryPlan?: AssistantQueryPlan;
  executionStages?: string[];
  answer?: string;
  status?: 'answered' | 'clarification_required' | 'refused';
  evidence?: Record<string, unknown>;
}

export const AssistantGraphState = Annotation.Root({
  question: Annotation<string>(),
  normalizedQuestion: Annotation<string | undefined>(),
  intent: Annotation<ParsedIntent | undefined>(),
  vendorCatalog: Annotation<AssistantLookup[] | undefined>(),
  vendorId: Annotation<string | undefined>(),
  vendorCandidates: Annotation<AssistantLookup[] | undefined>(),
  selectedVendorId: Annotation<string | undefined>(),
  query: Annotation<Partial<LedgerQueryDto> | undefined>(),
  clarificationRequired: Annotation<boolean | undefined>(),
  clarificationQuestion: Annotation<string | undefined>(),
  ledgerQuery: Annotation<Record<string, unknown> | undefined>(),
  queryPlan: Annotation<AssistantQueryPlan | undefined>(),
  executionStages: Annotation<string[] | undefined>(),
  answer: Annotation<string | undefined>(),
  status: Annotation<'answered' | 'clarification_required' | 'refused' | undefined>(),
  evidence: Annotation<Record<string, unknown> | undefined>(),
});
