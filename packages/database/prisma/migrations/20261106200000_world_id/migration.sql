-- AlterTable
ALTER TABLE "reward_pools" ADD COLUMN     "human_only" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "human_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "human_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "nullifier" DECIMAL(78,0) NOT NULL,
    "credential" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "human_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "human_verifications_user_id_key" ON "human_verifications"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "human_verifications_action_nullifier_key" ON "human_verifications"("action", "nullifier");

-- AddForeignKey
ALTER TABLE "human_verifications" ADD CONSTRAINT "human_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

