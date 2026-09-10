import { Prisma } from '@prisma/client';

export type BillingPeriod = 'weekly' | 'monthly' | 'quarterly' | 'annual';

export function normalizeToMonthly(amount: Prisma.Decimal, period: BillingPeriod): Prisma.Decimal {
  const divisors = { weekly: 52 / 12, monthly: 1, quarterly: 3, annual: 12 };
  return amount.div(divisors[period]);
}
