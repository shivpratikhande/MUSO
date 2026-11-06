-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('UNLOCK', 'TIP');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EarningSource" AS ENUM ('TIP', 'PHOTO_SALE', 'VIDEO_SALE', 'WATCH_REWARD');

-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('ESTIMATED', 'PENDING', 'CONFIRMED', 'AVAILABLE', 'PAID', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CONTENT_PURCHASED';
ALTER TYPE "NotificationType" ADD VALUE 'TIP_RECEIVED';

-- AlterTable
ALTER TABLE "post_media" ADD COLUMN     "full_key" TEXT,
ADD COLUMN     "preview_key" TEXT;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "currency" CHAR(3) NOT NULL DEFAULT 'INR',
ADD COLUMN     "minimum_minor" INTEGER,
ADD COLUMN     "price_minor" INTEGER,
ADD COLUMN     "pwyw_gated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "suggested_minor" INTEGER,
ADD COLUMN     "tips_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "content_pricing_history" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "mode" "MonetizationMode" NOT NULL,
    "price_minor" INTEGER,
    "suggested_minor" INTEGER,
    "minimum_minor" INTEGER,
    "pwyw_gated" BOOLEAN NOT NULL,
    "tips_enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_pricing_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "payer_id" UUID NOT NULL,
    "payee_id" UUID NOT NULL,
    "post_id" UUID,
    "kind" "PaymentKind" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "fee_bps" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "checkout_url" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "message" TEXT,
    "failure_reason" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "succeeded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "source" "EarningSource" NOT NULL,
    "payment_id" UUID,
    "post_id" UUID,
    "gross_minor" INTEGER NOT NULL,
    "fee_minor" INTEGER NOT NULL,
    "net_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "EarningStatus" NOT NULL,
    "available_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "account" TEXT NOT NULL,
    "user_id" UUID,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "event" TEXT NOT NULL,
    "payment_id" UUID,
    "earning_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_payments" (
    "ref" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" TEXT NOT NULL,
    "return_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sandbox_payments_pkey" PRIMARY KEY ("ref")
);

-- CreateIndex
CREATE INDEX "content_pricing_history_post_id_created_at_idx" ON "content_pricing_history"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_intents_status_created_at_idx" ON "payment_intents"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_intents_payer_id_created_at_idx" ON "payment_intents"("payer_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_intents_payee_id_created_at_idx" ON "payment_intents"("payee_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_payer_id_idempotency_key_key" ON "payment_intents"("payer_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_provider_provider_ref_key" ON "payment_intents"("provider", "provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "content_entitlements_payment_id_key" ON "content_entitlements"("payment_id");

-- CreateIndex
CREATE INDEX "content_entitlements_post_id_idx" ON "content_entitlements"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_entitlements_user_id_post_id_key" ON "content_entitlements"("user_id", "post_id");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_payment_id_key" ON "earnings"("payment_id");

-- CreateIndex
CREATE INDEX "earnings_creator_id_status_idx" ON "earnings"("creator_id", "status");

-- CreateIndex
CREATE INDEX "earnings_status_available_at_idx" ON "earnings"("status", "available_at");

-- CreateIndex
CREATE INDEX "ledger_entries_journal_id_idx" ON "ledger_entries"("journal_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries"("account");

-- CreateIndex
CREATE INDEX "ledger_entries_user_id_created_at_idx" ON "ledger_entries"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "content_pricing_history" ADD CONSTRAINT "content_pricing_history_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_pricing_history" ADD CONSTRAINT "content_pricing_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_entitlements" ADD CONSTRAINT "content_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_entitlements" ADD CONSTRAINT "content_entitlements_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_entitlements" ADD CONSTRAINT "content_entitlements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───── Integrity rules Prisma can't express ─────

-- Money is always positive integers in minor units.
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_amount_pos" CHECK ("amount_minor" > 0);
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_fee_bps" CHECK ("fee_bps" BETWEEN 0 AND 5000);
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_amounts" CHECK ("gross_minor" >= 0 AND "fee_minor" >= 0 AND "net_minor" >= 0 AND "gross_minor" = "fee_minor" + "net_minor");
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_nonzero" CHECK ("amount_minor" <> 0);
ALTER TABLE "posts" ADD CONSTRAINT "posts_pricing_valid" CHECK (
  ("monetization_mode" = 'FREE')
  OR ("monetization_mode" = 'PAY_TO_UNLOCK' AND "price_minor" > 0)
  OR ("monetization_mode" = 'PAY_WHAT_YOU_WANT' AND "suggested_minor" > 0 AND ("minimum_minor" IS NULL OR "minimum_minor" <= "suggested_minor"))
);

-- The ledger is append-only: corrections are new reversing entries, never edits.
CREATE OR REPLACE FUNCTION ledger_entries_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();

-- Every journal must balance to zero (checked at commit time).
CREATE OR REPLACE FUNCTION ledger_journal_balanced() RETURNS trigger AS $$
DECLARE total bigint;
BEGIN
  SELECT COALESCE(SUM(amount_minor), 0) INTO total FROM ledger_entries WHERE journal_id = NEW.journal_id;
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger journal % does not balance (sum=%)', NEW.journal_id, total;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER ledger_journal_balanced AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_journal_balanced();
