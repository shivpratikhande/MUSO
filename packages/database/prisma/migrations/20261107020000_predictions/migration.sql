-- CreateEnum
CREATE TYPE "PredictionTemplate" AS ENUM ('MATCH_WINNER', 'BATTLE', 'SETLIST', 'BEST_CLIP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PredictionResolution" AS ENUM ('MANUAL', 'DATA');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('PENDING', 'OPEN', 'SETTLED', 'REFUNDING');

-- CreateEnum
CREATE TYPE "PredictionPickStatus" AS ENUM ('TICKETED', 'CONFIRMED', 'PAID', 'LOST');

-- CreateTable
CREATE TABLE "prediction_markets" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "template" "PredictionTemplate" NOT NULL,
    "resolution" "PredictionResolution" NOT NULL,
    "options" JSONB NOT NULL,
    "locks_at" TIMESTAMP(3) NOT NULL,
    "settles_at" TIMESTAMP(3),
    "resolve_by" TIMESTAMP(3) NOT NULL,
    "min_stake_micro" BIGINT NOT NULL,
    "max_stake_micro" BIGINT NOT NULL,
    "creator_bps" INTEGER NOT NULL DEFAULT 0,
    "human_only" BOOLEAN NOT NULL DEFAULT false,
    "status" "PredictionStatus" NOT NULL DEFAULT 'PENDING',
    "chain_market_id" INTEGER,
    "create_tx" TEXT,
    "winning_option" INTEGER,
    "settle_tx" TEXT,
    "settled_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prediction_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_picks" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet" TEXT NOT NULL,
    "option" INTEGER NOT NULL,
    "stake_micro" BIGINT NOT NULL,
    "human_id" TEXT NOT NULL,
    "ticket_deadline" TIMESTAMP(3) NOT NULL,
    "status" "PredictionPickStatus" NOT NULL DEFAULT 'TICKETED',
    "pick_tx" TEXT,
    "payout_micro" BIGINT,
    "payout_tx" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prediction_picks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prediction_markets_chain_market_id_key" ON "prediction_markets"("chain_market_id");

-- CreateIndex
CREATE INDEX "prediction_markets_event_id_idx" ON "prediction_markets"("event_id");

-- CreateIndex
CREATE INDEX "prediction_markets_status_idx" ON "prediction_markets"("status");

-- CreateIndex
CREATE INDEX "prediction_picks_status_idx" ON "prediction_picks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_picks_market_id_user_id_key" ON "prediction_picks"("market_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_picks_market_id_human_id_key" ON "prediction_picks"("market_id", "human_id");

-- AddForeignKey
ALTER TABLE "prediction_markets" ADD CONSTRAINT "prediction_markets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_markets" ADD CONSTRAINT "prediction_markets_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_picks" ADD CONSTRAINT "prediction_picks_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "prediction_markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_picks" ADD CONSTRAINT "prediction_picks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

