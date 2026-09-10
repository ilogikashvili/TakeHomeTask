import { LedgerQueryDto } from '../../line-items/dto/ledger-query.dto';

export type AssistantIntent = 'vendor_spend' | 'category_spend' | 'renewal_summary';

export interface StructuredIntent {
  intent: AssistantIntent;
  query: LedgerQueryDto;
  vendorText?: string;
  clarificationRequired?: boolean;
}
