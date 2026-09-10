export interface GeminiAssistantContext {
  question: string;
  intentHints?: {
    vendorText?: string;
    category?: string;
    annualize?: boolean;
    period?: string;
    year?: number;
    unsupported?: boolean;
  };
}

export function buildGeminiAssistantContext(question: string, hints?: GeminiAssistantContext['intentHints']): GeminiAssistantContext {
  return {
    question,
    intentHints: {
      ...(hints?.vendorText ? { vendorText: hints.vendorText } : {}),
      ...(hints?.category ? { category: hints.category } : {}),
      ...(typeof hints?.annualize === 'boolean' ? { annualize: hints.annualize } : {}),
      ...(hints?.period ? { period: hints.period } : {}),
      ...(typeof hints?.year === 'number' ? { year: hints.year } : {}),
      ...(typeof hints?.unsupported === 'boolean' ? { unsupported: hints.unsupported } : {}),
    },
  };
}
