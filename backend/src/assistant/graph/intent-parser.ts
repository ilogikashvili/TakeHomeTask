import { z } from 'zod';

const knownCategories = ['software', 'hardware', 'services', 'facilities', 'travel'];

export const intentSchema = z.object({
  intent: z.enum(['vendor_spend', 'category_spend', 'services_increase', 'unapproved_renewals', 'renewal_summary', 'unsupported']),
  vendorText: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  annualize: z.boolean().default(false),
  amountMin: z.number().min(0).max(999999999999.99).optional(),
  amountMax: z.number().min(0).max(999999999999.99).optional(),
  period: z.enum(['this_month', 'next_month', 'this_year', 'next_30_days', 'next_60_days']).optional(),
  year: z.number().int().min(1900).max(2200).optional(),
}).strict();
  export const INTENT_SCHEMA_VERSION = 'intent-schema-v1';
export type ParsedIntent = z.infer<typeof intentSchema>;

function parseCurrencyAmount(value: string): number | undefined {
  const normalized = value.replace(/[^\d.]/g, '');
  if (!normalized) return undefined;
  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? asNumber : undefined;
}

/** Accept only an explicit period-only continuation; never append unbounded user text. */
export function resolveFollowup(question: string, previous?: ParsedIntent): ParsedIntent | undefined {
  if (!previous || previous.intent === 'unsupported') return undefined;
  const trimmed = question.trim();
  const amountMatch = trimmed.match(/(?:over|above|more than|greater than|at least|>=)\s*(?:₾|GEL)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  if (amountMatch) {
    const parsed = parseIntent(previous.vendorText ? `How much do we spend on ${previous.vendorText}?` : `How much do we spend on ${previous.category ?? 'software'}?`);
    const amount = parseCurrencyAmount(amountMatch[1]);
    return intentSchema.parse({ ...parsed, ...previous, amountMin: amount ?? previous.amountMin, category: previous.category, vendorText: previous.vendorText, annualize: previous.annualize, period: previous.period, year: previous.year });
  }
  const match = trimmed.match(/^(?:and|what about|how about)\s+(this month|next month|this year|next 30 days|(?:19|20|21)\d{2})[?.!]?$/i);
  if (!match) return undefined;
  const patch = parseIntent('renewals ' + match[1]);
  return intentSchema.parse({ ...previous, period: patch.period, year: patch.year });
}

export function parseIntent(question: string): ParsedIntent {
  const text = question.toLowerCase().trim();
  if (!/\b(spend|spending|cost|total|renew|renews|renewal|renewals|renewing|contracts|subscriptions|pay|paid)\b/.test(text)) {
    return { intent: 'unsupported', annualize: false };
  }
  const categoryMatch = text.match(/\b(?:on|for|in)\s+(?:the\s+)?((?:software|hardware|services|facilities|travel))\b/i);
  const category = categoryMatch ? categoryMatch[1].toLowerCase() : question.match(/\bcategory\s+([\w-]+)/i)?.[1]?.toLowerCase();
  const intent = /which vendors drove the increase/.test(text) ? 'services_increase'
    : /nobody has approved|not approved|without approval/.test(text) ? 'unapproved_renewals'
      : /renew/.test(text) ? 'renewal_summary' : category ? 'category_spend' : 'vendor_spend';
  const quoted = question.match(/["“]([^"”]+)["”]/)?.[1];
  const candidateVendor = question.match(/\b(?:on|with|for|vendor|pay|paid)\s+(?!the\s+)(?!software\b)(?!hardware\b)(?!services\b)(?!facilities\b)(?!travel\b)(.+?)(?=\s*(?:this|next|in\s+\d{4}|annually|per\s+year|a year|yearly|[?.!]|$))/i)?.[1]?.trim();
  const vendor = category ? undefined : quoted ?? candidateVendor;
  const amountMatch = text.match(/(?:over|above|more than|greater than|at least|>=)\s*(?:₾|gel)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  const amountMin = amountMatch ? parseCurrencyAmount(amountMatch[1]) : undefined;
  return intentSchema.parse({ intent, annualize: /\b(annualized|annually|per year|a year|yearly)\b/.test(text),
    vendorText: vendor && vendor.length > 0 ? vendor : undefined,
    category: category && knownCategories.includes(category) ? category : undefined,
    amountMin,
    period: text.includes('next month') ? 'next_month' : text.includes('this month') ? 'this_month'
      : text.includes('this year') ? 'this_year' : /next 60 days/.test(text) ? 'next_60_days' : /next 30 days/.test(text) ? 'next_30_days' : undefined,
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
  if (intent.intent === 'renewal_summary' || intent.period === 'next_30_days' || intent.period === 'next_60_days') {
    return { renewalFrom: day(now), renewalTo: day(new Date(now.getTime() + (intent.period === 'next_60_days' ? 60 : 30) * 86400000)) };
  }
  return undefined;
}

export function normalizeEntity(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
}

export function vendorCandidates(text: string, vendors: Array<{ id: string; name: string }>) {
  const normalized = normalizeEntity(text);
  const exact = vendors.filter((vendor) => normalizeEntity(vendor.name) === normalized);
  const prefix = vendors.filter((vendor) => normalizeEntity(vendor.name).startsWith(normalized));
  const partial = vendors.filter((vendor) => normalizeEntity(vendor.name).includes(normalized));
  const matches = Array.from(new Map([...exact, ...prefix, ...partial].map((vendor) => [vendor.id, vendor])).values());
  if (matches.length) return matches;
  // Preserve a reasonable ambiguity boundary for short typos and vendor names that share a meaningful
  // root (for example “micro” / “microsoft”). Leave the final choice to the caller instead of guessing.
  return vendors.filter((vendor) => {
    const name = normalizeEntity(vendor.name);
    if (!name || !normalized) return false;
    if (name.startsWith(normalized) || normalized.startsWith(name)) return true;
    let sharedPrefix = 0;
    while (sharedPrefix < Math.min(name.length, normalized.length) && name[sharedPrefix] === normalized[sharedPrefix]) {
      sharedPrefix++;
    }
    return sharedPrefix >= 4;
  });
}
