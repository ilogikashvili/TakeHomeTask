ALTER TYPE "LineItemStatus" ADD VALUE IF NOT EXISTS 'EXPIRING';
ALTER TYPE "LineItemStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TABLE "LineItem" ADD COLUMN "reference" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "LineItem" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "LineItem_reference_key" ON "LineItem"("reference");