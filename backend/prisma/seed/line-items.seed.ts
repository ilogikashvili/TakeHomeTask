import { faker } from '@faker-js/faker';
import { ApprovalAction, BillingPeriod, LineItemStatus, PrismaClient } from '@prisma/client';

const billingPeriods: BillingPeriod[] = [
  BillingPeriod.WEEKLY,
  BillingPeriod.MONTHLY,
  BillingPeriod.QUARTERLY,
  BillingPeriod.ANNUAL,
];

const statusPattern: LineItemStatus[] = [
  LineItemStatus.ACTIVE,
  LineItemStatus.ACTIVE,
  LineItemStatus.ACTIVE,
  LineItemStatus.ACTIVE,
  LineItemStatus.PENDING_APPROVAL,
  LineItemStatus.DRAFT,
  LineItemStatus.ACTIVE,
  LineItemStatus.ACTIVE,
  LineItemStatus.TERMINATED,
  LineItemStatus.EXPIRING,
  LineItemStatus.EXPIRED,
  LineItemStatus.ACTIVE,
];
const categories = ['software', 'hardware', 'services', 'facilities', 'travel'];

export async function seedLineItems(prisma: PrismaClient): Promise<void> {
  const [vendors, owners] = await Promise.all([
    prisma.vendor.findMany({ select: { id: true, category: true } }),
    prisma.owner.findMany({ select: { id: true } }),
  ]);

  if (vendors.length !== 200 || owners.length !== 30) {
    throw new Error('Seed prerequisites are missing: expected 200 vendors and 30 owners');
  }

  const baseDate = new Date();
  const lineItems = Array.from({ length: 2500 }, (_, index) => {
    const vendor = vendors[index % vendors.length];
    const owner = owners[(index * 7) % owners.length];
    const category = categories[index % categories.length];
    const categoryOffset = categories.indexOf(category);
    const startDate = faker.date.between({ from: new Date('2022-01-01'), to: new Date(baseDate.getTime() - 30 * 86400000) });
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 365 + (index % 730));
    const status = statusPattern[(index + categoryOffset) % statusPattern.length];
    const renewalDate = status === LineItemStatus.TERMINATED || (index + categoryOffset) % 17 === 0
      ? null
      : (() => {
          const nextRenewal = new Date(startDate);
          nextRenewal.setUTCDate(nextRenewal.getUTCDate() + 30 + ((index * 13 + categoryOffset * 7) % 540));
          return nextRenewal;
        })();

    return {
      vendorId: vendor.id,
      ownerId: owner.id,
      reference: `VC-${String(index + 1).padStart(5, '0')}`,
      name: `${category} subscription ${index + 1}`,
      description: faker.company.catchPhrase(),
      category,
      status,
      billingPeriod: billingPeriods[index % billingPeriods.length],
      amount: faker.number.float({ min: 100, max: 250000, fractionDigits: 2 }),
      startDate,
      endDate,
      renewalDate,
      autoRenew: index % 3 !== 0,
    };
  });

  await prisma.lineItem.createMany({ data: lineItems });

  const persisted = await prisma.lineItem.findMany({
    where: { ownerId: { in: owners.map((owner) => owner.id) } },
    select: { id: true, ownerId: true, status: true },
  });

  const approvalEvents = persisted.flatMap((lineItem, index) => {
    const count = lineItem.status === LineItemStatus.ACTIVE
      ? 1 + (index % 5)
      : lineItem.status === LineItemStatus.PENDING_APPROVAL
        ? (index % 3)
        : lineItem.status === LineItemStatus.DRAFT || lineItem.status === LineItemStatus.EXPIRING || lineItem.status === LineItemStatus.EXPIRED
          ? (index % 2)
          : 0;
    return Array.from({ length: count }, (_, approvalIndex) => ({
      lineItemId: lineItem.id,
      actorId: lineItem.ownerId,
      action: [ApprovalAction.CREATED, ApprovalAction.APPROVED, ApprovalAction.STATUS_CHANGED, ApprovalAction.UPDATED][(index + approvalIndex) % 4],
      toStatus: lineItem.status,
      note: `Deterministic approval ${approvalIndex + 1}`,
    }));
  });

  if (approvalEvents.length > 0) {
    await prisma.approvalEvent.createMany({ data: approvalEvents });
  }
}
