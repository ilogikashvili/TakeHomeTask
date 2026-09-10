-- Initial production-minded domain schema.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "LineItemStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PENDING_APPROVAL', 'TERMINATED');
CREATE TYPE "BillingPeriod" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');
CREATE TYPE "ApprovalAction" AS ENUM ('CREATED', 'APPROVED', 'REJECTED', 'STATUS_CHANGED');
CREATE TYPE "NotificationType" AS ENUM ('RENEWAL_REMINDER');

CREATE TABLE "Owner" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vendor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LineItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendorId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" "LineItemStatus" NOT NULL DEFAULT 'DRAFT',
    "billingPeriod" "BillingPeriod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "renewalDate" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LineItem_amount_nonnegative" CHECK ("amount" >= 0),
    CONSTRAINT "LineItem_dates_valid" CHECK ("endDate" > "startDate"),
    CONSTRAINT "LineItem_renewal_valid" CHECK ("renewalDate" IS NULL OR "renewalDate" >= "startDate"),
    CONSTRAINT "LineItem_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "ApprovalEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lineItemId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "fromStatus" "LineItemStatus",
    "toStatus" "LineItemStatus",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reminder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lineItemId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "renewalDate" DATE NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "reminderId" UUID,
    "type" "NotificationType" NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QueryAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question" TEXT NOT NULL,
    "resolvedIntent" JSONB NOT NULL,
    "generatedSql" TEXT,
    "parameters" JSONB,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "resultIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "durationMs" INTEGER,
    "model" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueryAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantConversation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "resolvedFilters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");
CREATE INDEX "Owner_name_idx" ON "Owner"("name");
CREATE INDEX "Vendor_normalizedName_idx" ON "Vendor"("normalizedName");
CREATE INDEX "Vendor_category_idx" ON "Vendor"("category");
CREATE INDEX "LineItem_vendorId_category_idx" ON "LineItem"("vendorId", "category");
CREATE INDEX "LineItem_ownerId_renewalDate_idx" ON "LineItem"("ownerId", "renewalDate");
CREATE INDEX "LineItem_status_renewalDate_idx" ON "LineItem"("status", "renewalDate");
CREATE INDEX "LineItem_category_status_idx" ON "LineItem"("category", "status");
CREATE INDEX "LineItem_renewalDate_id_idx" ON "LineItem"("renewalDate", "id");
CREATE INDEX "LineItem_amount_id_idx" ON "LineItem"("amount", "id");
CREATE INDEX "LineItem_startDate_id_idx" ON "LineItem"("startDate", "id");
CREATE INDEX "LineItem_status_id_idx" ON "LineItem"("status", "id");
CREATE INDEX "ApprovalEvent_lineItemId_createdAt_idx" ON "ApprovalEvent"("lineItemId", "createdAt");
CREATE INDEX "ApprovalEvent_actorId_createdAt_idx" ON "ApprovalEvent"("actorId", "createdAt");
CREATE UNIQUE INDEX "Reminder_lineItemId_renewalDate_key" ON "Reminder"("lineItemId", "renewalDate");
CREATE INDEX "Reminder_ownerId_dismissedAt_createdAt_idx" ON "Reminder"("ownerId", "dismissedAt", "createdAt");
CREATE INDEX "Reminder_renewalDate_idx" ON "Reminder"("renewalDate");
CREATE INDEX "Notification_ownerId_readAt_createdAt_idx" ON "Notification"("ownerId", "readAt", "createdAt");
CREATE INDEX "Notification_reminderId_idx" ON "Notification"("reminderId");
CREATE INDEX "QueryAudit_createdAt_idx" ON "QueryAudit"("createdAt");
CREATE INDEX "QueryAudit_requestId_idx" ON "QueryAudit"("requestId");
CREATE INDEX "AssistantConversation_ownerId_updatedAt_idx" ON "AssistantConversation"("ownerId", "updatedAt");
CREATE INDEX "AssistantMessage_conversationId_createdAt_idx" ON "AssistantMessage"("conversationId", "createdAt");

ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
