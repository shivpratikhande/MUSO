-- CreateEnum
CREATE TYPE "ArcPayoutStatus" AS ENUM ('WAITING_WALLET', 'AWARDED', 'CLAIMED', 'SKIPPED');

-- AlterTable
ALTER TABLE "reward_pools" ADD COLUMN     "arc_campaign_id" INTEGER,
ADD COLUMN     "arc_sponsor" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "wallet_address" TEXT,
ADD COLUMN     "wallet_linked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "arc_payouts" (
    "id" UUID NOT NULL,
    "pool_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "amount_micro" BIGINT NOT NULL,
    "wallet" TEXT,
    "status" "ArcPayoutStatus" NOT NULL DEFAULT 'WAITING_WALLET',
    "award_tx" TEXT,
    "claim_tx" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arc_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arc_payouts_status_idx" ON "arc_payouts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "arc_payouts_pool_id_creator_id_key" ON "arc_payouts"("pool_id", "creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_pools_arc_campaign_id_key" ON "reward_pools"("arc_campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- AddForeignKey
ALTER TABLE "arc_payouts" ADD CONSTRAINT "arc_payouts_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "reward_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arc_payouts" ADD CONSTRAINT "arc_payouts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

