import { ApprovalAction, BillingPeriod, LineItemStatus, PrismaClient } from '@prisma/client';

const LINE_ITEM_COUNT = 3000;
const categories = ['software', 'hardware', 'services', 'facilities', 'travel'] as const;
const billingPeriods: BillingPeriod[] = [BillingPeriod.WEEKLY, BillingPeriod.MONTHLY, BillingPeriod.QUARTERLY, BillingPeriod.ANNUAL];
const statusWeights = [
  { status: LineItemStatus.ACTIVE, weight: 0.55 },
  { status: LineItemStatus.PENDING_APPROVAL, weight: 0.15 },
  { status: LineItemStatus.DRAFT, weight: 0.1 },
  { status: LineItemStatus.EXPIRING, weight: 0.08 },
  { status: LineItemStatus.EXPIRED, weight: 0.07 },
  { status: LineItemStatus.TERMINATED, weight: 0.05 },
] as const;
const categoryWeights = { software: 0.32, hardware: 0.2, services: 0.28, facilities: 0.12, travel: 0.08 } as const;
const billingPeriodWeights = { WEEKLY: 0.22, MONTHLY: 0.45, QUARTERLY: 0.2, ANNUAL: 0.13 } as const;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(items: readonly T[], weights: readonly number[], random: () => number): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    threshold -= weights[index];
    if (threshold <= 0) return items[index];
  }
  return items[items.length - 1];
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function amountFor(category: string, billingPeriod: BillingPeriod, random: () => number): number {
  const baseByCategory = {
    software: 2400,
    hardware: 1600,
    services: 3200,
    facilities: 5200,
    travel: 360,
  } as const;

  const periodModifier = {
    WEEKLY: 1,
    MONTHLY: 1.4,
    QUARTERLY: 2.1,
    ANNUAL: 4.6,
  } as const;

  const categoryBias = {
    software: 1.4,
    hardware: 1.2,
    services: 1.7,
    facilities: 2.5,
    travel: 0.8,
  } as const;

  const tail = Math.pow(random(), 0.38);
  const variance = 0.35 + (1 - tail) * 3.6;
  const amount = baseByCategory[category as keyof typeof baseByCategory] * periodModifier[billingPeriod] * categoryBias[category as keyof typeof categoryBias] * variance;
  return clamp(Number(amount.toFixed(2)), 45, 430000);
}

function nearestQuarterStart(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const quarterMonth = Math.floor(month / 3) * 3;
  const quarterStart = new Date(Date.UTC(year, quarterMonth, 1));
  return quarterStart;
}

function chooseRenewalDate(startDate: Date, billingPeriod: BillingPeriod, random: () => number): Date {
  const current = new Date(startDate);
  const quarterStartMonth = Math.floor(current.getUTCMonth() / 3) * 3;
  const currentQuarterEnd = new Date(Date.UTC(current.getUTCFullYear(), quarterStartMonth + 3, 0));
  const targetQuarterEnd = currentQuarterEnd > current ? currentQuarterEnd : new Date(Date.UTC(current.getUTCFullYear(), quarterStartMonth + 6, 0));

  const fuzzDays = Math.floor(random() * 18) - 8;
  const date = addDays(targetQuarterEnd, fuzzDays);

  if (date <= current) {
    return addDays(targetQuarterEnd, 2);
  }

  if (billingPeriod === BillingPeriod.WEEKLY) {
    return addDays(date, Math.floor(random() * 14));
  }

  return date;
}

function statusFor(index: number, random: () => number): LineItemStatus {
  const roll = random();
  if (roll < 0.55) return LineItemStatus.ACTIVE;
  if (roll < 0.7) return LineItemStatus.PENDING_APPROVAL;
  if (roll < 0.8) return LineItemStatus.DRAFT;
  if (roll < 0.88) return LineItemStatus.EXPIRING;
  if (roll < 0.96) return LineItemStatus.EXPIRED;
  return LineItemStatus.TERMINATED;
}

export async function seedLineItems(prisma: PrismaClient): Promise<void> {
  const [vendors, owners] = await Promise.all([
    prisma.vendor.findMany({ select: { id: true, category: true, name: true } }),
    prisma.owner.findMany({ select: { id: true } }),
  ]);

  if (vendors.length !== 200 || owners.length !== 30) {
    throw new Error('Seed prerequisites are missing: expected 200 vendors and 30 owners');
  }

  const vendorsByCategory = categories.reduce((map, category) => {
    map.set(category, vendors.filter((vendor) => vendor.category === category));
    return map;
  }, new Map<string, Array<{ id: string; category: string; name: string }>>());

  const random = mulberry32(20260909);
  const now = new Date();
  const lineItems = Array.from({ length: LINE_ITEM_COUNT }, (_, index) => {
    const category = pickWeighted(categories, Object.values(categoryWeights), random) as typeof categories[number];
    const categoryVendors = vendorsByCategory.get(category)!;
    const topVendorWeight = 4;
    const weights = categoryVendors.map((_, vendorIndex) => vendorIndex < 10 ? topVendorWeight : 1);
    const vendor = pickWeighted(categoryVendors, weights, random);
    const owner = owners[index % owners.length];
    const billingPeriod = pickWeighted(billingPeriods, Object.values(billingPeriodWeights), random) as BillingPeriod;
    const status = statusFor(index, random);

    const startDate = addDays(now, -Math.floor(random() * 600) - 45);
    const durationMonths = billingPeriod === BillingPeriod.WEEKLY ? 1 : billingPeriod === BillingPeriod.MONTHLY ? 5 : billingPeriod === BillingPeriod.QUARTERLY ? 8 : 14;
    const endDate = addMonths(startDate, durationMonths + Math.floor(random() * 4));
    const renewalDate = status === LineItemStatus.TERMINATED ? null : chooseRenewalDate(startDate, billingPeriod, random);

    return {
      vendorId: vendor.id,
      ownerId: owner.id,
      reference: `VC-${String(index + 1).padStart(5, '0')}`,
      name: `${vendor.name} ${billingPeriod.toLowerCase()} contract ${index + 1}`,
      description: `${(index % 3 === 0 ? 'Recurring' : 'Operational')} ${category} commitment for ${vendor.name}.`,
      category,
      status,
      billingPeriod,
      amount: amountFor(category, billingPeriod, random),
      startDate,
      endDate,
      renewalDate,
      autoRenew: status !== LineItemStatus.TERMINATED && random() > 0.2,
    };
  });

  const lineItemData = lineItems.map((item) => ({
    ...item,
    amount: Number(item.amount.toFixed(2)),
  }));

  await prisma.lineItem.createMany({ data: lineItemData });

  const persisted = await prisma.lineItem.findMany({
    where: { ownerId: { in: owners.map((owner) => owner.id) } },
    select: { id: true, ownerId: true, status: true },
  });

  const approvalEvents = persisted.flatMap((lineItem, index) => {
    if (lineItem.status !== LineItemStatus.ACTIVE) {
      return [];
    }

    const events: Array<{ lineItemId: string; actorId: string; action: ApprovalAction; toStatus: LineItemStatus; note: string }> = [
      {
        lineItemId: lineItem.id,
        actorId: lineItem.ownerId,
        action: ApprovalAction.CREATED,
        toStatus: lineItem.status,
        note: `Seeded approval event ${index + 1}`,
      },
    ];

    const additional = 1 + Math.floor(random() * 4);
    for (let eventIndex = 0; eventIndex < additional; eventIndex += 1) {
      events.push({
        lineItemId: lineItem.id,
        actorId: lineItem.ownerId,
        action: eventIndex === 0 ? ApprovalAction.APPROVED : [ApprovalAction.UPDATED, ApprovalAction.STATUS_CHANGED][(index + eventIndex) % 2],
        toStatus: lineItem.status,
        note: `Seeded approval event ${index + 1}.${eventIndex + 1}`,
      });
    }

    return events.slice(0, 8);
  });

  if (approvalEvents.length > 0) {
    await prisma.approvalEvent.createMany({ data: approvalEvents });
  }
}
