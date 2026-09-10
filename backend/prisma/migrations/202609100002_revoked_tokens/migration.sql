CREATE TABLE "RevokedToken" ("id" UUID PRIMARY KEY, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "RevokedToken_expiresAt_idx" ON "RevokedToken"("expiresAt");
ALTER TYPE "ApprovalAction" ADD VALUE 'UPDATED';
CREATE TABLE "UsageBucket" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "UsageBucket_expiresAt_idx" ON "UsageBucket"("expiresAt");
