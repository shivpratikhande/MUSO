/**
 * One-time Hedera testnet setup for the demo, using your portal account as the operator:
 *   - creates the MUSO treasury account (receives agent payments) with auto token association
 *   - associates the agent (operator) account with testnet USDC
 * Prints the values to put in .env files. Get testnet USDC from https://faucet.circle.com (Hedera).
 */
import { config } from 'dotenv';
import {
  AccountCreateTransaction,
  Client,
  Hbar,
  PrivateKey,
  TokenAssociateTransaction,
} from '@hiero-ledger/sdk';

config({ path: new URL('../.env', import.meta.url).pathname });
const USDC_TESTNET = '0.0.429274';

async function main() {
  const operatorId = process.env['HEDERA_ACCOUNT_ID'];
  const operatorKey = process.env['HEDERA_PRIVATE_KEY'];
  if (!operatorId || !operatorKey)
    throw new Error('Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in apps/agent/.env');
  const key = PrivateKey.fromString(operatorKey);
  const client = Client.forTestnet().setOperator(operatorId, key);

  try {
    const assoc = await new TokenAssociateTransaction()
      .setAccountId(operatorId)
      .setTokenIds([USDC_TESTNET])
      .freezeWith(client)
      .sign(key);
    await (await assoc.execute(client)).getReceipt(client);
    console.log(`Agent ${operatorId} associated with USDC ${USDC_TESTNET}`);
  } catch (err) {
    console.log(`USDC association: ${(err as Error).message} (fine if already associated)`);
  }

  const treasuryKey = PrivateKey.generateECDSA();
  const receipt = await (
    await new AccountCreateTransaction()
      .setKeyWithoutAlias(treasuryKey.publicKey)
      .setInitialBalance(new Hbar(5))
      .setMaxAutomaticTokenAssociations(10)
      .execute(client)
  ).getReceipt(client);
  console.log('\nMUSO treasury account created (receives x402 payments):');
  console.log(`  X402_PAY_TO=${receipt.accountId?.toString()}`);
  console.log(
    `  treasury private key (keep secret, not needed by the API): ${treasuryKey.toStringRaw()}`,
  );
  console.log(
    '\nNext: put X402_PAY_TO in the root .env with X402_ENABLED=true, and fund the agent with testnet USDC at https://faucet.circle.com',
  );
  client.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
