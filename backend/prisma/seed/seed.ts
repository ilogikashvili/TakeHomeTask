import { LineItemStatus, PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { seedLineItems } from './line-items.seed';
import { seedOwners } from './owners.seed';
import { seedVendors } from './vendors.seed';

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  faker.seed(20260909);
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

  const [ownerCount, vendorCount, lineItemCount, activeCount, approvedActiveCount, categoryCounts, statusCounts] = await Promise.all([
    prisma.owner.count(),
    prisma.vendor.count(),
    prisma.lineItem.count(),
    prisma.lineItem.count({ where: { status: LineItemStatus.ACTIVE } }),
    prisma.lineItem.count({ where: { status: LineItemStatus.ACTIVE, approvals: { some: {} } } }),
    prisma.lineItem.groupBy({ by: ['category'], _count: true }),
    prisma.lineItem.groupBy({ by: ['status'], _count: true }),
  ]);

  const requiredCategories = ['software', 'hardware', 'services', 'facilities', 'travel'];
  const requiredStatuses = Object.values(LineItemStatus);
  if (ownerCount !== 30 || vendorCount !== 200 || lineItemCount !== 2500 || activeCount !== approvedActiveCount
    || requiredCategories.some(category => !categoryCounts.some(row => row.category === category))
    || requiredStatuses.some(status => !statusCounts.some(row => row.status === status))) {
    throw new Error(`Seed validation failed: owners=${ownerCount}, vendors=${vendorCount}, lineItems=${lineItemCount}, active=${activeCount}, approvedActive=${approvedActiveCount}`);
  }
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
