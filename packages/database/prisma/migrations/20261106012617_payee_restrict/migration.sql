-- DropForeignKey
ALTER TABLE "payment_intents" DROP CONSTRAINT "payment_intents_payee_id_fkey";

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
