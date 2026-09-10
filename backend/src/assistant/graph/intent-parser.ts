import { z } from 'zod';

export const intentSchema = z.object({
  intent: z.enum(['vendor_spend', 'category_spend', 'renewal_summary', 'unsupported']),
  vendorText: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  annualize: z.boolean().default(false),
  period: z.enum(['this_month', 'next_month', 'this_year', 'next_30_days']).optional(),
  year: z.number().int().min(1900).max(2200).optional(),
}).strict();
  export const INTENT_SCHEMA_VERSION = 'intent-schema-v1';
export type ParsedIntent = z.infer<typeof intentSchema>;

/** Accept only an explicit period-only continuation; never append unbounded user text. */
export function resolveFollowup(question: string, previous?: ParsedIntent): ParsedIntent | undefined {
  if (!previous || previous.intent === 'unsupported') return undefined;
  const match = question.trim().match(/^(?:and|what about|how about)\s+(this month|next month|this year|next 30 days|(?:19|20|21)\d{2})[?.!]?$/i);
  if (!match) return undefined;
  const patch = parseIntent('renewals ' + match[1]);
  return intentSchema.parse({ ...previous, period: patch.period, year: patch.year });
}

export function parseIntent(question: string): ParsedIntent {
  const text = question.toLowerCase().trim();
  if (!/\b(spend|spending|cost|total|renew|renewal|renewals|renewing|contracts|subscriptions)\b/.test(text)) {
    return { intent: 'unsupported', annualize: false };
  }
  const intent = /renew/.test(text) ? 'renewal_summary' : /categor/.test(text) ? 'category_spend' : 'vendor_spend';
  const quoted = question.match(/["“]([^"”]+)["”]/)?.[1];
  const vendor = question.match(/\b(?:on|with|for|vendor)\s+(.+?)(?=\s+(?:this|next|in\s+\d{4}|annually|per\s+year)\b|[?.!]|$)/i)?.[1]?.trim();
  const category = question.match(/\bcategory\s+([\w-]+)/i)?.[1];
  return intentSchema.parse({ intent, annualize: /\b(annualized|annually|per year)\b/.test(text),
    vendorText: quoted ?? (category ? undefined : vendor), category,
    period: text.includes('next month') ? 'next_month' : text.includes('this month') ? 'this_month'
      : text.includes('this year') ? 'this_year' : /next 30 days/.test(text) ? 'next_30_days' : undefined,
    year: /\b(?:19|20|21)\d{2}\b/.test(text) ? Number(text.match(/\b(?:19|20|21)\d{2}\b/)![0]) : undefined,
  });
}

export function renewalWindow(intent: ParsedIntent, now = new Date()): { renewalFrom: string; renewalTo: string } | undefined {
  const y = intent.year ?? now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = (date: Date) => date.toISOString().slice(0, 10);
  if (intent.year || intent.period === 'this_year') return { renewalFrom: `${y}-01-01`, renewalTo: `${y}-12-31` };
  if (intent.period === 'this_month' || intent.period === 'next_month') {
    const month = m + (intent.period === 'next_month' ? 1 : 0);
    return { renewalFrom: day(new Date(Date.UTC(y, month, 1))), renewalTo: day(new Date(Date.UTC(y, month + 1, 0))) };
  }
  if (intent.intent === 'renewal_summary' || intent.period === 'next_30_days') {
    return { renewalFrom: day(now), renewalTo: day(new Date(now.getTime() + 30 * 86400000)) };
  }
  return undefined;
}

export function normalizeEntity(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
}

export function vendorCandidates(text: string, vendors: Array<{ id: string; name: string }>) {
  const normalized = normalizeEntity(text);
  const exact = vendors.filter((vendor) => normalizeEntity(vendor.name) === normalized);
  if (exact.length) return exact;
  const partial = vendors.filter((vendor) => normalizeEntity(vendor.name).includes(normalized));
  if (partial.length) return partial;
  // A single insertion, deletion, or substitution is a candidate, never an automatic choice.
  return vendors.filter((vendor) => {
    const name = normalizeEntity(vendor.name);
    if (Math.abs(name.length - normalized.length) > 1) return false;
    let a = 0, b = 0, differences = 0;
    while (a < name.length && b < normalized.length) {
      if (name[a] === normalized[b]) { a++; b++; continue; }
      if (++differences > 1) return false;
      if (name.length >= normalized.length) a++;
      if (normalized.length >= name.length) b++;
    }
    return differences + (name.length - a) + (normalized.length - b) <= 1;
  });
}
