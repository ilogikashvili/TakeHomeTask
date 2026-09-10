import { faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';

export async function seedOwners(prisma: PrismaClient): Promise<void> {
  const owners = Array.from({ length: 30 }, (_, index) => {
    const name = faker.person.fullName();
    return {
      name,
      email: `owner-${index + 1}@example.com`,
    };
  });

  await prisma.owner.createMany({ data: owners });
}
