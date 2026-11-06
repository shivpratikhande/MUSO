#!/usr/bin/env node
/**
 * Puts MUSO's ENS names (<username>.muso.eth) live on Ethereum Sepolia.
 *
 *   node scripts/ens-sepolia.mjs wallet            make (once) a deployer wallet, show its address + balance
 *   node scripts/ens-sepolia.mjs deploy [baseUrl]  deploy MusoOffchainResolver, save ENS_RESOLVER_ADDRESS to .env
 *   node scripts/ens-sepolia.mjs set-url [baseUrl] point the resolver at a new https API address (e.g. a new tunnel)
 *   node scripts/ens-sepolia.mjs check [name]      resolve a name on Sepolia the way wallets do
 *
 * baseUrl defaults to ARC_PUBLIC_URL (the https tunnel). The gateway must be reachable over https.
 * Registering the parent name itself happens in the ENS app (sepolia.app.ens.domains); after deploy,
 * set the name's resolver there to the printed address. Private keys are never printed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, formatEther, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';

const envPath = new URL('../.env', import.meta.url).pathname;
const artifactPath = new URL(
  '../packages/contracts/out/MusoOffchainResolver.sol/MusoOffchainResolver.json',
  import.meta.url,
).pathname;

let envText = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const setEnv = (name, value) => {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, 'm');
  envText = re.test(envText) ? envText.replace(re, line) : `${envText.replace(/\n?$/, '\n')}${line}\n`;
  writeFileSync(envPath, envText);
};

const rpc = env.ENS_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const pub = createPublicClient({ chain: sepolia, transport: http(rpc, { timeout: 20_000 }) });
const parent = env.ENS_PARENT_NAME || 'muso.eth';

function gatewayUrl(base) {
  const b = (base || env.ARC_PUBLIC_URL || '').replace(/\/$/, '');
  if (!b.startsWith('https://')) {
    console.error('Need an https API address (pass one, or set ARC_PUBLIC_URL to the tunnel).');
    process.exit(1);
  }
  return `${b}/v1/ens/gateway/{sender}/{data}.json`;
}

function deployer() {
  if (!env.ENS_DEPLOYER_PRIVATE_KEY) {
    console.error('No deployer wallet yet. Run: node scripts/ens-sepolia.mjs wallet');
    process.exit(1);
  }
  return privateKeyToAccount(env.ENS_DEPLOYER_PRIVATE_KEY);
}

async function checkGateway(url) {
  const probe = url.replace('/v1/ens/gateway/{sender}/{data}.json', '/v1/ens/status');
  try {
    const res = await fetch(probe, { headers: { 'ngrok-skip-browser-warning': '1' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    if (!data?.enabled) throw new Error('ENS is off on the API (ENS_ENABLED)');
    return data.signer;
  } catch (err) {
    console.error(`The API isn't reachable at ${probe}: ${err.message}`);
    process.exit(1);
  }
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'wallet') {
  if (!env.ENS_DEPLOYER_PRIVATE_KEY) {
    setEnv('ENS_DEPLOYER_PRIVATE_KEY', generatePrivateKey());
    env.ENS_DEPLOYER_PRIVATE_KEY = envText.match(/^ENS_DEPLOYER_PRIVATE_KEY=(.*)$/m)[1];
    console.log('Made a new Sepolia deployer wallet (key saved in .env, not shown).');
  }
  const { address } = deployer();
  const bal = await pub.getBalance({ address });
  console.log(`Deployer address: ${address}`);
  console.log(`Sepolia balance:  ${formatEther(bal)} ETH`);
  if (bal === 0n) console.log('Send ~0.02 Sepolia ETH to this address (from your MetaMask or a faucet), then run deploy.');
} else if (cmd === 'deploy') {
  const account = deployer();
  const url = gatewayUrl(arg);
  const signer = await checkGateway(url);
  const bal = await pub.getBalance({ address: account.address });
  if (bal === 0n) {
    console.error(`Deployer ${account.address} has no Sepolia ETH yet.`);
    process.exit(1);
  }
  const art = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc, { timeout: 20_000 }) });
  console.log(`Deploying MusoOffchainResolver (signer ${signer})…`);
  const hash = await wallet.deployContract({
    abi: art.abi,
    bytecode: art.bytecode.object,
    args: [account.address, url, [signer]],
  });
  console.log(`tx: https://sepolia.etherscan.io/tx/${hash}`);
  const rcpt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (rcpt.status !== 'success' || !rcpt.contractAddress) {
    console.error('Deploy failed.');
    process.exit(1);
  }
  setEnv('ENS_RESOLVER_ADDRESS', rcpt.contractAddress);
  console.log(`Resolver: ${rcpt.contractAddress} (saved as ENS_RESOLVER_ADDRESS)`);
  console.log(`Gateway:  ${url}`);
  console.log(`Next: in sepolia.app.ens.domains open ${parent} → Records/More → Resolver → Custom → paste the resolver address.`);
} else if (cmd === 'set-url') {
  const account = deployer();
  const address = env.ENS_RESOLVER_ADDRESS;
  if (!address) {
    console.error('No ENS_RESOLVER_ADDRESS in .env; run deploy first.');
    process.exit(1);
  }
  const url = gatewayUrl(arg);
  await checkGateway(url);
  const art = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc, { timeout: 20_000 }) });
  const hash = await wallet.writeContract({ address, abi: art.abi, functionName: 'setUrl', args: [url] });
  await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log(`Resolver now uses ${url}`);
} else if (cmd === 'check') {
  const name = normalize(arg || parent);
  const resolver = await pub.getEnsResolver({ name: normalize(parent) });
  console.log(`${parent} resolver on Sepolia: ${resolver}`);
  if (env.ENS_RESOLVER_ADDRESS && resolver.toLowerCase() !== env.ENS_RESOLVER_ADDRESS.toLowerCase())
    console.log(`  (expected ${env.ENS_RESOLVER_ADDRESS}; set it in the ENS app)`);
  if (arg) {
    const address = await pub.getEnsAddress({ name });
    const description = await pub.getEnsText({ name, key: 'description' }).catch(() => null);
    console.log(`${name} → ${address ?? '(no address)'}`);
    if (description) console.log(`  bio: ${description}`);
  }
} else {
  console.log('Usage: node scripts/ens-sepolia.mjs wallet | deploy [baseUrl] | set-url [baseUrl] | check [name]');
}
