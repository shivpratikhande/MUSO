-- CreateEnum
CREATE TYPE "RewardPoolStatus" AS ENUM ('DRAFT', 'FUNDED', 'DISTRIBUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WatchSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'FLAGGED');

-- AlterEnum
ALTER TYPE "PaymentKind" ADD VALUE 'POOL_FUNDING';

-- DropForeignKey
ALTER TABLE "payment_intents" DROP CONSTRAINT "payment_intents_payee_id_fkey";

-- AlterTable
ALTER TABLE "earnings" ADD COLUMN     "reward_pool_id" UUID;

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN     "reward_pool_id" UUID,
ALTER COLUMN "payee_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "reward_pools" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sponsor_name" TEXT NOT NULL,
    "rules" TEXT NOT NULL DEFAULT '',
    "budget_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "per_video_cap_bps" INTEGER NOT NULL DEFAULT 2500,
    "min_qualified_viewers" INTEGER NOT NULL DEFAULT 3,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "RewardPoolStatus" NOT NULL DEFAULT 'DRAFT',
    "funded_at" TIMESTAMP(3),
    "distributed_at" TIMESTAMP(3),
    "unallocated_minor" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_allocations" (
    "id" UUID NOT NULL,
    "pool_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "qualified_ms" BIGINT NOT NULL,
    "qualified_viewers" INTEGER NOT NULL,
    "share_minor" INTEGER NOT NULL,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_sessions" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "viewer_id" UUID NOT NULL,
    "device_hash" TEXT NOT NULL,
    "ip_hash" TEXT,
    "qualifying" BOOLEAN NOT NULL,
    "disqualify_reason" TEXT,
    "status" "WatchSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "flag_reason" TEXT,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "credited_ms" INTEGER NOT NULL DEFAULT 0,
    "last_beat_at" TIMESTAMP(3) NOT NULL,
    "last_position_ms" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "watch_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_heartbeats" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position_ms" INTEGER NOT NULL,
    "playing" BOOLEAN NOT NULL,
    "foreground" BOOLEAN NOT NULL,
    "credited_ms" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "watch_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualified_watch_time" (
    "post_id" UUID NOT NULL,
    "viewer_id" UUID NOT NULL,
    "qualified_ms" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qualified_watch_time_pkey" PRIMARY KEY ("post_id","viewer_id")
);

-- CreateIndex
CREATE INDEX "reward_pools_event_id_idx" ON "reward_pools"("event_id");

-- CreateIndex
CREATE INDEX "reward_pools_status_ends_at_idx" ON "reward_pools"("status", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "reward_allocations_pool_id_post_id_key" ON "reward_allocations"("pool_id", "post_id");

-- CreateIndex
CREATE INDEX "watch_sessions_viewer_id_status_idx" ON "watch_sessions"("viewer_id", "status");

-- CreateIndex
CREATE INDEX "watch_sessions_post_id_status_idx" ON "watch_sessions"("post_id", "status");

-- CreateIndex
CREATE INDEX "watch_sessions_device_hash_started_at_idx" ON "watch_sessions"("device_hash", "started_at");

-- CreateIndex
CREATE INDEX "watch_sessions_ip_hash_post_id_started_at_idx" ON "watch_sessions"("ip_hash", "post_id", "started_at");

-- CreateIndex
CREATE INDEX "watch_heartbeats_session_id_received_at_idx" ON "watch_heartbeats"("session_id", "received_at");

-- CreateIndex
CREATE INDEX "qualified_watch_time_post_id_idx" ON "qualified_watch_time"("post_id");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_reward_pool_id_fkey" FOREIGN KEY ("reward_pool_id") REFERENCES "reward_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_reward_pool_id_fkey" FOREIGN KEY ("reward_pool_id") REFERENCES "reward_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_pools" ADD CONSTRAINT "reward_pools_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_pools" ADD CONSTRAINT "reward_pools_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_allocations" ADD CONSTRAINT "reward_allocations_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "reward_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_allocations" ADD CONSTRAINT "reward_allocations_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_sessions" ADD CONSTRAINT "watch_sessions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_sessions" ADD CONSTRAINT "watch_sessions_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_heartbeats" ADD CONSTRAINT "watch_heartbeats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "watch_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───── Integrity rules ─────
ALTER TABLE "reward_pools" ADD CONSTRAINT "reward_pools_budget_pos" CHECK ("budget_minor" > 0);
ALTER TABLE "reward_pools" ADD CONSTRAINT "reward_pools_window" CHECK ("ends_at" > "starts_at");
ALTER TABLE "reward_pools" ADD CONSTRAINT "reward_pools_cap_bps" CHECK ("per_video_cap_bps" BETWEEN 100 AND 10000);
ALTER TABLE "reward_pools" ADD CONSTRAINT "reward_pools_min_viewers" CHECK ("min_qualified_viewers" BETWEEN 1 AND 1000);
ALTER TABLE "reward_allocations" ADD CONSTRAINT "reward_allocations_share_nonneg" CHECK ("share_minor" >= 0);
ALTER TABLE "watch_sessions" ADD CONSTRAINT "watch_sessions_credit_nonneg" CHECK ("credited_ms" >= 0);
ALTER TABLE "qualified_watch_time" ADD CONSTRAINT "qualified_watch_time_nonneg" CHECK ("qualified_ms" >= 0);
-- Every payment except pool funding must have a payee.
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payee" CHECK (("kind" = 'POOL_FUNDING') = ("payee_id" IS NULL));
