import { AssistantState } from '../state';
import { normalizeEntity, vendorCandidates } from '../intent-parser';

export function resolveEntitiesNode(state: AssistantState): Partial<AssistantState> {
  const { intent, vendorCatalog = [] } = state;
  if (!intent || intent.intent === 'unsupported' || !intent.vendorText) {
    return { vendorCandidates: [] };
  }

  const candidates = vendorCandidates(intent.vendorText, vendorCatalog);
  const exactMatch = candidates.find((candidate) => normalizeEntity(candidate.name) === normalizeEntity(intent.vendorText ?? ''));

  return {
    vendorCandidates: candidates.slice(0, 10),
    selectedVendorId: exactMatch?.id,
  };
}
