import { faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';

export async function seedVendors(prisma: PrismaClient): Promise<void> {
  const categories = ['software', 'infrastructure', 'professional-services', 'operations', 'marketing'];
  const vendors = Array.from({ length: 200 }, (_, index) => {
    const name = `${faker.company.name()} ${index + 1}`;
    return {
      name,
      normalizedName: name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
      category: categories[index % categories.length],
    };
  });

  await prisma.vendor.createMany({ data: vendors });
}
