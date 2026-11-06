import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Env } from '../../config/env.js';

/** Injection token for the Arc chain client (overridden with a fake in tests). */
export const ARC_CHAIN = Symbol('ARC_CHAIN');

/** On-chain campaign (RewardCampaigns.getCampaign). Amounts are USDC base units (6 decimals). */
export interface ArcCampaign {
  sponsor: Address;
  title: string;
  budget: bigint;
  maxPerRecipient: bigint;
  awardedTotal: bigint;
  allocator: Address;
  endsAt: number;
  awardWindowEnd: number;
  reclaimed: boolean;
}

export interface ArcChain {
  readonly contract: Address;
  readonly allocator: Address;
  readonly explorerUrl: string;
  /** Null when the campaign id doesn't exist. */
  getCampaign(id: number): Promise<ArcCampaign | null>;
  awardOf(id: number, participant: Address): Promise<bigint>;
  hasClaimed(id: number, participant: Address): Promise<boolean>;
  /** Sends awardMany from the allocator and waits for success. Returns the tx hash. */
  awardMany(id: number, participants: Address[], amounts: bigint[]): Promise<Hex>;
  /** Relays claimFor (allocator pays gas; USDC goes to the participant). Returns the tx hash. */
  claimFor(id: number, participant: Address): Promise<Hex>;
  /** EOA or smart-wallet (ERC-1271 / ERC-6492) signature check. */
  verifySignature(address: Address, message: string, signature: Hex): Promise<boolean>;
}

export const REWARD_CAMPAIGNS_ABI = parseAbi([
  'struct Campaign { address sponsor; string title; uint256 budget; uint256 maxPerRecipient; uint256 awardedTotal; address allocator; uint64 endsAt; uint64 awardWindowEnd; bool reclaimed; }',
  'function campaignCount() view returns (uint256)',
  'function getCampaign(uint256 id) view returns (Campaign)',
  'function awardOf(uint256 id, address participant) view returns (uint256)',
  'function hasClaimed(uint256 id, address participant) view returns (bool)',
  'function awardMany(uint256 id, address[] participants, uint256[] amounts)',
  'function claimFor(uint256 id, address participant)',
]);

export class ViemArcChain implements ArcChain {
  readonly contract: Address;
  readonly allocator: Address;
  readonly explorerUrl: string;
  private readonly pub;
  private readonly wallet;

  constructor(env: Env) {
    const chain = defineChain({
      id: env.ARC_CHAIN_ID,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: [env.ARC_RPC_URL] } },
    });
    const account = privateKeyToAccount(env.ARC_ALLOCATOR_PRIVATE_KEY as Hex);
    this.contract = getAddress(env.ARC_REWARD_CAMPAIGNS_ADDRESS!);
    this.allocator = account.address;
    this.explorerUrl = env.ARC_EXPLORER_URL.replace(/\/$/, '');
    this.pub = createPublicClient({ chain, transport: http() });
    this.wallet = createWalletClient({ chain, account, transport: http() });
  }

  async getCampaign(id: number): Promise<ArcCampaign | null> {
    const count = await this.pub.readContract({
      address: this.contract,
      abi: REWARD_CAMPAIGNS_ABI,
      functionName: 'campaignCount',
    });
    if (id < 1 || BigInt(id) > count) return null;
    const c = await this.pub.readContract({
      address: this.contract,
      abi: REWARD_CAMPAIGNS_ABI,
      functionName: 'getCampaign',
      args: [BigInt(id)],
    });
    return { ...c, endsAt: Number(c.endsAt), awardWindowEnd: Number(c.awardWindowEnd) };
  }

  awardOf(id: number, participant: Address): Promise<bigint> {
    return this.pub.readContract({
      address: this.contract,
      abi: REWARD_CAMPAIGNS_ABI,
      functionName: 'awardOf',
      args: [BigInt(id), participant],
    });
  }

  hasClaimed(id: number, participant: Address): Promise<boolean> {
    return this.pub.readContract({
      address: this.contract,
      abi: REWARD_CAMPAIGNS_ABI,
      functionName: 'hasClaimed',
      args: [BigInt(id), participant],
    });
  }

  async awardMany(id: number, participants: Address[], amounts: bigint[]): Promise<Hex> {
    // Simulate first: a revert surfaces as a decoded error and costs no gas.
    const { request } = await this.pub.simulateContract({
      account: this.wallet.account,
      address: this.contract,
      abi: REWARD_CAMPAIGNS_ABI,
      functionName: 'awardMany',
      args: [BigInt(id), participants, amounts],
    });
    return this.send(await this.wallet.writeContract(request));
  }

  async claimFor(id: number, participant: Address): Promise<Hex> {
    const { request } = await this.pub.simulateContract({
      account: this.wallet.account,
      address: this.contract,
      abi: REWARD_CAMPAIGNS_ABI,
      functionName: 'claimFor',
      args: [BigInt(id), participant],
    });
    return this.send(await this.wallet.writeContract(request));
  }

  verifySignature(address: Address, message: string, signature: Hex): Promise<boolean> {
    return this.pub.verifyMessage({ address, message, signature });
  }

  private async send(hash: Hex): Promise<Hex> {
    const receipt = await this.pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`Arc transaction ${hash} reverted`);
    return hash;
  }
}
