import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;

export function formatGel(amount: Money | number): string {
  return `${new Prisma.Decimal(amount).toFixed(2)} GEL`;
}
