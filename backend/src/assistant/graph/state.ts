export interface AssistantState {
  question: string;
  normalizedQuestion?: string;
  intent?: 'vendor_spend' | 'category_spend' | 'renewal_summary';
  vendorId?: string;
  vendorCandidates?: Array<{ id: string; name: string }>;
  ledgerQuery?: Record<string, unknown>;
  answer?: string;
}
