import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  parseEventLogs,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Env } from '../../config/env.js';

/** Injection token for the PredictionPools client (overridden with a fake in tests). */
export const PREDICTION_CHAIN = Symbol('PREDICTION_CHAIN');

export const PREDICTION_POOLS_ABI = parseAbi([
  'struct Market { address resolver; address gatekeeper; uint64 locksAt; uint64 resolveBy; uint8 optionCount; uint8 winningOption; uint8 status; uint16 creatorBps; address creator; uint256 minStake; uint256 maxStake; uint256 totalStaked; uint256 winnerPool; bytes32 externalRef; }',
  'struct Position { uint256 stake; uint8 option; bool paid; }',
  'function createMarket(address resolver, address gatekeeper, uint8 optionCount, uint64 locksAt, uint64 resolveBy, uint256 minStake, uint256 maxStake, uint16 creatorBps, bytes32 externalRef) returns (uint256)',
  'function pick(uint256 marketId, uint8 option, uint256 amount, bytes32 humanId, uint64 deadline, bytes ticket)',
  'function settle(uint256 marketId, uint8 winningOption, address creator)',
  'function cancel(uint256 marketId)',
  'function claim(uint256 marketId, address account) returns (uint256)',
  'function refund(uint256 marketId, address account) returns (uint256)',
  'function getMarket(uint256 marketId) view returns (Market)',
  'function positionOf(uint256 marketId, address account) view returns (Position)',
  'function payoutOf(uint256 marketId, address account) view returns (uint256)',
  'event MarketCreated(uint256 indexed marketId, address indexed resolver, address indexed gatekeeper, uint8 optionCount, uint64 locksAt, uint64 resolveBy, uint256 minStake, uint256 maxStake, uint16 creatorBps, bytes32 externalRef)',
]);

/** On-chain market status (PredictionPools.Status). */
export type ChainMarketStatus = 'OPEN' | 'SETTLED' | 'REFUNDING';
const STATUS: ChainMarketStatus[] = ['OPEN', 'SETTLED', 'REFUNDING'];

export interface ChainPosition {
  stake: bigint;
  option: number;
  paid: boolean;
}

export interface NewChainMarket {
  optionCount: number;
  locksAt: number;
  resolveBy: number;
  minStake: bigint;
  maxStake: bigint;
  creatorBps: number;
  /** MUSO's market id (bytes32). */
  externalRef: Hex;
}

export interface PredictionChain {
  readonly contract: Address;
  readonly usdc: Address;
  /** MUSO's key: resolver of every market and gatekeeper that signs pick tickets. */
  readonly operator: Address;
  readonly explorerUrl: string;
  createMarket(m: NewChainMarket): Promise<{ marketId: number; tx: Hex }>;
  /** EIP-712 PickTicket signed by the gatekeeper. */
  signTicket(marketId: number, picker: Address, humanId: Hex, deadline: number): Promise<Hex>;
  /** Calldata the picker sends (approve USDC first). */
  pickData(
    marketId: number,
    option: number,
    amount: bigint,
    humanId: Hex,
    deadline: number,
    ticket: Hex,
  ): Hex;
  positionOf(marketId: number, account: Address): Promise<ChainPosition>;
  /** Declares the result. Returns the status after (REFUNDING if nobody picked the winner). */
  settle(
    marketId: number,
    option: number,
    creator: Address | null,
  ): Promise<{ tx: Hex; status: ChainMarketStatus }>;
  cancel(marketId: number): Promise<Hex>;
  status(marketId: number): Promise<ChainMarketStatus>;
  payoutOf(marketId: number, account: Address): Promise<bigint>;
  /** Relayed by MUSO (it pays the gas); funds always go to `account`. */
  claim(marketId: number, account: Address): Promise<Hex>;
  refund(marketId: number, account: Address): Promise<Hex>;
}

const ZERO = '0x0000000000000000000000000000000000000000' as const;

export class ViemPredictionChain implements PredictionChain {
  readonly contract: Address;
  readonly usdc: Address;
  readonly operator: Address;
  readonly explorerUrl: string;
  private readonly chainId: number;
  private readonly account;
  private readonly pub;
  private readonly wallet;

  constructor(env: Env) {
    const chain = defineChain({
      id: env.ARC_CHAIN_ID,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: [env.ARC_RPC_URL] } },
    });
    this.account = privateKeyToAccount(env.ARC_ALLOCATOR_PRIVATE_KEY as Hex);
    this.contract = getAddress(env.PREDICTIONS_CONTRACT_ADDRESS!);
    this.usdc = getAddress(env.ARC_USDC_ADDRESS);
    this.operator = this.account.address;
    this.explorerUrl = env.ARC_EXPLORER_URL.replace(/\/$/, '');
    this.chainId = env.ARC_CHAIN_ID;
    this.pub = createPublicClient({ chain, transport: http() });
    this.wallet = createWalletClient({ chain, account: this.account, transport: http() });
  }

  async createMarket(m: NewChainMarket): Promise<{ marketId: number; tx: Hex }> {
    const { request } = await this.pub.simulateContract({
      account: this.account,
      address: this.contract,
      abi: PREDICTION_POOLS_ABI,
      functionName: 'createMarket',
      args: [
        this.operator,
        this.operator,
        m.optionCount,
        BigInt(m.locksAt),
        BigInt(m.resolveBy),
        m.minStake,
        m.maxStake,
        m.creatorBps,
        m.externalRef,
      ],
    });
    const hash = await this.wallet.writeContract(request);
    const receipt = await this.pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`createMarket ${hash} reverted`);
    const [log] = parseEventLogs({
      abi: PREDICTION_POOLS_ABI,
      eventName: 'MarketCreated',
      logs: receipt.logs,
    });
    if (!log) throw new Error(`MarketCreated not found in ${hash}`);
    return { marketId: Number(log.args.marketId), tx: hash };
  }

  signTicket(marketId: number, picker: Address, humanId: Hex, deadline: number): Promise<Hex> {
    return this.account.signTypedData({
      domain: {
        name: 'MUSO PredictionPools',
        version: '1',
        chainId: this.chainId,
        verifyingContract: this.contract,
      },
      types: {
        PickTicket: [
          { name: 'marketId', type: 'uint256' },
          { name: 'picker', type: 'address' },
          { name: 'humanId', type: 'bytes32' },
          { name: 'deadline', type: 'uint64' },
        ],
      },
      primaryType: 'PickTicket',
      message: { marketId: BigInt(marketId), picker, humanId, deadline: BigInt(deadline) },
    });
  }

  pickData(
    marketId: number,
    option: number,
    amount: bigint,
    humanId: Hex,
    deadline: number,
    ticket: Hex,
  ): Hex {
    return encodeFunctionData({
      abi: PREDICTION_POOLS_ABI,
      functionName: 'pick',
      args: [BigInt(marketId), option, amount, humanId, BigInt(deadline), ticket],
    });
  }

  async positionOf(marketId: number, account: Address): Promise<ChainPosition> {
    const p = await this.pub.readContract({
      address: this.contract,
      abi: PREDICTION_POOLS_ABI,
      functionName: 'positionOf',
      args: [BigInt(marketId), account],
    });
    return { stake: p.stake, option: p.option, paid: p.paid };
  }

  async settle(marketId: number, option: number, creator: Address | null) {
    const tx = await this.write('settle', [BigInt(marketId), option, creator ?? ZERO]);
    return { tx, status: await this.status(marketId) };
  }

  cancel(marketId: number): Promise<Hex> {
    return this.write('cancel', [BigInt(marketId)]);
  }

  async status(marketId: number): Promise<ChainMarketStatus> {
    const m = await this.pub.readContract({
      address: this.contract,
      abi: PREDICTION_POOLS_ABI,
      functionName: 'getMarket',
      args: [BigInt(marketId)],
    });
    return STATUS[m.status] ?? 'OPEN';
  }

  payoutOf(marketId: number, account: Address): Promise<bigint> {
    return this.pub.readContract({
      address: this.contract,
      abi: PREDICTION_POOLS_ABI,
      functionName: 'payoutOf',
      args: [BigInt(marketId), account],
    });
  }

  claim(marketId: number, account: Address): Promise<Hex> {
    return this.write('claim', [BigInt(marketId), account]);
  }

  refund(marketId: number, account: Address): Promise<Hex> {
    return this.write('refund', [BigInt(marketId), account]);
  }

  /** Simulate first (a revert costs no gas and surfaces a decoded error), then send and wait. */
  private async write(
    functionName: 'settle' | 'cancel' | 'claim' | 'refund',
    args: readonly unknown[],
  ): Promise<Hex> {
    const { request } = await this.pub.simulateContract({
      account: this.account,
      address: this.contract,
      abi: PREDICTION_POOLS_ABI,
      functionName,
      args,
    } as never);
    const hash = await this.wallet.writeContract(request as never);
    const receipt = await this.pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${functionName} ${hash} reverted`);
    return hash;
  }
}
