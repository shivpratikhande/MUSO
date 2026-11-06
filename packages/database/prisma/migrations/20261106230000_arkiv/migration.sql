-- AlterTable
ALTER TABLE "arc_payouts" ADD COLUMN     "arkiv_key" TEXT;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "arkiv_key" TEXT;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "arkiv_key" TEXT,
ADD COLUMN     "arkiv_owner" TEXT;

-- AlterTable
ALTER TABLE "reward_pools" ADD COLUMN     "arkiv_report_key" TEXT,
ADD COLUMN     "arkiv_shares_at" TIMESTAMP(3);

