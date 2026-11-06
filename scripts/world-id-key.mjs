#!/usr/bin/env node
/**
 * Saves the World ID RP signing key into the root .env without it ever appearing on screen.
 *   node scripts/world-id-key.mjs
 * Paste the key from developer.world.org → World ID Configuration → Rotate signer key.
 * It checks the key, sets WORLD_ID_SIGNING_KEY + WORLD_ID_ENABLED=true, and prints the signer
 * ADDRESS (public) so you can compare it with the portal. The key itself is never printed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { privateKeyToAccount } from 'viem/accounts';

const envPath = new URL('../.env', import.meta.url).pathname;

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const raw = await askHidden('Paste the World ID signing key (hidden), then press Enter: ');
const hex = raw.replace(/^0x/i, '');
if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
  console.error('That doesn’t look like a signing key (expected 64 hex characters). Nothing was saved.');
  process.exit(1);
}
const address = privateKeyToAccount(`0x${hex}`).address;

let env = readFileSync(envPath, 'utf8');
const set = (name, value) => {
  const line = `${name}=${value}`;
  env = new RegExp(`^${name}=.*$`, 'm').test(env)
    ? env.replace(new RegExp(`^${name}=.*$`, 'm'), line)
    : `${env.replace(/\n?$/, '\n')}${line}\n`;
};
set('WORLD_ID_SIGNING_KEY', `0x${hex}`);
set('WORLD_ID_ENABLED', 'true');
writeFileSync(envPath, env);

console.log('Saved to .env and World ID is switched on.');
console.log(`Signer address for this key: ${address}`);
console.log('It must match "Signer address" on developer.world.org → World ID Configuration.');
