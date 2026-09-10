import { faker } from '@faker-js/faker';
import { ApprovalAction, BillingPeriod, LineItemStatus, PrismaClient } from '@prisma/client';

const billingPeriods: BillingPeriod[] = [
  BillingPeriod.WEEKLY,
  BillingPeriod.MONTHLY,
  BillingPeriod.QUARTERLY,
  BillingPeriod.ANNUAL,
];

export async function seedLineItems(prisma: PrismaClient): Promise<void> {
  const [vendors, owners] = await Promise.all([
    prisma.vendor.findMany({ select: { id: true, category: true } }),
    prisma.owner.findMany({ select: { id: true } }),
  ]);

  if (vendors.length !== 200 || owners.length !== 30) {
    throw new Error('Seed prerequisites are missing: expected 200 vendors and 30 owners');
  }

  const lineItems = Array.from({ length: 2500 }, (_, index) => {
    const vendor = vendors[index % vendors.length];
    const owner = owners[(index * 7) % owners.length];
    const startDate = faker.date.between({ from: '2022-01-01', to: '2025-12-31' });
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1 + 365 + (index % 730));
    const status = index % 10 === 0
      ? LineItemStatus.TERMINATED
      : index % 7 === 0
        ? LineItemStatus.PENDING_APPROVAL
        : index % 5 === 0
          ? LineItemStatus.DRAFT
          : LineItemStatus.ACTIVE;
    const renewalDate = status === LineItemStatus.TERMINATED || index % 13 === 0
      ? null
      : faker.date.between({ from: startDate, to: endDate });

    return {
      vendorId: vendor.id,
      ownerId: owner.id,
      name: `${vendor.category} subscription ${index + 1}`,
      description: faker.company.catchPhrase(),
      category: vendor.category,
      status,
      billingPeriod: billingPeriods[index % billingPeriods.length],
      amount: faker.number.float({ min: 100, max: 250000, fractionDigits: 2 }),
      startDate,
      endDate,
      renewalDate,
    };
  });

  await prisma.lineItem.createMany({ data: lineItems });

  const activeLineItems = await prisma.lineItem.findMany({
    where: { status: LineItemStatus.ACTIVE },
    select: { id: true, ownerId: true },
  });
  await prisma.approvalEvent.createMany({
    data: activeLineItems.map((lineItem) => ({
      lineItemId: lineItem.id,
      actorId: lineItem.ownerId,
      action: ApprovalAction.APPROVED,
      toStatus: LineItemStatus.ACTIVE,
      note: 'Deterministic seed approval',
    })),
  });
}
