import { LineItemStatus, PrismaClient } from '@prisma/client';
import { seedLineItems } from './line-items.seed';
import { seedOwners } from './owners.seed';
import { seedVendors } from './vendors.seed';

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  await prisma.usageBucket.deleteMany();
  await prisma.revokedToken.deleteMany();
  await prisma.queryAudit.deleteMany();
  await prisma.assistantMessage.deleteMany();
  await prisma.assistantConversation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.approvalEvent.deleteMany();
  await prisma.lineItem.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.owner.deleteMany();

  await seedOwners(prisma);
  await seedVendors(prisma);
  await seedLineItems(prisma);

  const [ownerCount, vendorCount, lineItemCount, categoryCounts, statusCounts, vendorSpend] = await Promise.all([
    prisma.owner.count(),
    prisma.vendor.count(),
    prisma.lineItem.count(),
    prisma.lineItem.groupBy({ by: ['category'], _count: true }),
    prisma.lineItem.groupBy({ by: ['status'], _count: true }),
    prisma.lineItem.groupBy({ by: ['vendorId'], _sum: { amount: true } }),
  ]);

  const requiredCategories = ['software', 'hardware', 'services', 'facilities', 'travel'];
  const requiredStatuses = Object.values(LineItemStatus);
  const categoryMap = Object.fromEntries(categoryCounts.map((row) => [row.category, row._count]));
  const statusMap = Object.fromEntries(statusCounts.map((row) => [row.status, row._count]));

  if (ownerCount !== 30 || vendorCount !== 200 || lineItemCount < 2500 || lineItemCount > 3500) {
    throw new Error(`Seed validation failed: owners=${ownerCount}, vendors=${vendorCount}, lineItems=${lineItemCount}`);
  }

  for (const category of requiredCategories) {
    if (!categoryMap[category] || categoryMap[category] < 150) {
      throw new Error(`Seed validation failed: category ${category} missing or too sparse: ${categoryMap[category] ?? 0}`);
    }
  }

  for (const status of requiredStatuses) {
    if (!statusMap[status] || statusMap[status] < 1) {
      throw new Error(`Seed validation failed: status ${status} missing`);
    }
  }

  const activeItems = await prisma.lineItem.count({ where: { status: LineItemStatus.ACTIVE } });
  const activeWithApprovals = await prisma.lineItem.count({ where: { status: LineItemStatus.ACTIVE, approvals: { some: {} } } });
  if (activeItems !== activeWithApprovals) {
    throw new Error(`Seed validation failed: active items without approval history: active=${activeItems}, approvedActive=${activeWithApprovals}`);
  }

  const totalSpend = await prisma.lineItem.aggregate({ _sum: { amount: true } });
  const topSpend = vendorSpend
    .map((row) => ({ vendorId: row.vendorId, spend: Number(row._sum.amount ?? 0) }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .reduce((sum, row) => sum + row.spend, 0);
  const concentration = topSpend / (Number(totalSpend._sum.amount ?? 0) || 1);
  if (concentration < 0.2) {
    throw new Error(`Seed validation failed: vendor concentration too low (${concentration.toFixed(3)})`);
  }

  const renewals = await prisma.lineItem.findMany({
    where: { renewalDate: { not: null } },
    select: { renewalDate: true },
  });
  const quarterEndRenewals = renewals.filter((row) => {
    const date = new Date(row.renewalDate!);
    const quarterEnds = [
      new Date(Date.UTC(date.getUTCFullYear(), 2, 31)),
      new Date(Date.UTC(date.getUTCFullYear(), 5, 30)),
      new Date(Date.UTC(date.getUTCFullYear(), 8, 30)),
      new Date(Date.UTC(date.getUTCFullYear(), 11, 31)),
    ];

    return quarterEnds.some((quarterEnd) => Math.abs(date.getTime() - quarterEnd.getTime()) <= 20 * 24 * 60 * 60 * 1000);
  }).length;

  if (quarterEndRenewals < 150) {
    throw new Error(`Seed validation failed: insufficient renewal clustering around quarter ends (${quarterEndRenewals})`);
  }

  const invalidDates = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::int AS count
    FROM "LineItem"
    WHERE ("renewalDate" IS NOT NULL AND "renewalDate" < "startDate")
       OR "endDate" <= "startDate";
  `;
  if (Number(invalidDates[0].count) > 0) {
    throw new Error(`Seed validation failed: invalid date relationships detected (${invalidDates[0].count})`);
  }
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
