import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodePacked,
  hexToBytes,
  keccak256,
  namehash,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { sign } from 'viem/accounts';

/**
 * CCIP-Read (EIP-3668) gateway codec for ENS wildcard resolution (ENSIP-10).
 *
 * Flow: a client calls `resolve(name, data)` on MUSO's OffchainResolver → it reverts with
 * OffchainLookup(callData = resolve(name, data)) → the client sends callData here → we answer
 * `abi.encode(result, expires, sig)` → the client calls `resolveWithProof(response, callData)`
 * and the contract checks the signature (same scheme as ensdomains/offchain-resolver).
 */

/** `resolve(bytes name, bytes data)` — both IExtendedResolver and the gateway's IResolverService. */
export const GATEWAY_ABI = parseAbi(['function resolve(bytes name, bytes data)']);

/** Resolver profile calls MUSO answers. */
export const RESOLVER_ABI = parseAbi([
  'function addr(bytes32 node) view returns (address)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes)',
  'function text(bytes32 node, string key) view returns (string)',
  'function contenthash(bytes32 node) view returns (bytes)',
]);

/** SLIP-44 coin type for Ethereum; ENSIP-11 EVM chains use 0x80000000 | chainId (ENSIP-19 default = 0x80000000). */
const COIN_TYPE_ETH = 60n;
const EVM_COIN_TYPE_FLAG = 0x8000_0000n;

/** Decodes a DNS wire-format name (ENSIP-10) into a dotted name. */
export function dnsDecode(encoded: Hex): string {
  const bytes = hexToBytes(encoded);
  const labels: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const len = bytes[i]!;
    if (len === 0) {
      if (i !== bytes.length - 1) throw new Error('Trailing bytes after name');
      return labels.join('.');
    }
    if (i + 1 + len > bytes.length) throw new Error('Label runs past the end');
    labels.push(new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(i + 1, i + 1 + len)));
    i += 1 + len;
  }
  throw new Error('Name is not 0-terminated');
}

/** What the gateway knows about one name. `address` null = no address record. */
export interface EnsRecords {
  address: Address | null;
  texts: Record<string, string>;
}

export interface GatewayRequest {
  name: string;
  /** The inner resolver call (addr / text / …). */
  data: Hex;
}

/** Decodes the OffchainLookup callData sent to the gateway. */
export function decodeGatewayRequest(callData: Hex): GatewayRequest {
  const { args } = decodeFunctionData({ abi: GATEWAY_ABI, data: callData });
  return { name: dnsDecode(args[0]).toLowerCase(), data: args[1] };
}

/**
 * ABI-encoded answer to one resolver call. Unknown names get empty answers (zero address,
 * empty string) rather than errors, like a normal resolver with no record set.
 * A call whose `node` isn't the namehash of the requested name is answered empty too.
 */
export function answer(name: string, data: Hex, records: EnsRecords | null): Hex {
  const call = decodeFunctionData({ abi: RESOLVER_ABI, data });
  const node = call.args[0];
  const r = node === namehash(name) ? records : null;

  switch (call.functionName) {
    case 'addr': {
      if (call.args.length === 1) {
        return encodeAbiParameters(
          [{ type: 'address' }],
          [r?.address ?? '0x0000000000000000000000000000000000000000'],
        );
      }
      const coinType = call.args[1]!;
      const isEvm = coinType === COIN_TYPE_ETH || (coinType & EVM_COIN_TYPE_FLAG) !== 0n;
      return encodeAbiParameters([{ type: 'bytes' }], [isEvm && r?.address ? r.address : '0x']);
    }
    case 'text': {
      const key = call.args[1];
      return encodeAbiParameters([{ type: 'string' }], [r?.texts[key] ?? '']);
    }
    case 'contenthash':
      return encodeAbiParameters([{ type: 'bytes' }], ['0x']);
  }
}

/** The digest the OffchainResolver recovers the signer from (EIP-191 version 0x00, "intended validator"). */
export function signatureHash(target: Address, expires: bigint, request: Hex, result: Hex): Hex {
  return keccak256(
    encodePacked(
      ['bytes', 'address', 'uint64', 'bytes32', 'bytes32'],
      ['0x1900', target, expires, keccak256(request), keccak256(result)],
    ),
  );
}

/** `abi.encode(result, expires, sig)` — what `resolveWithProof` expects. */
export async function signResponse(opts: {
  privateKey: Hex;
  sender: Address;
  callData: Hex;
  result: Hex;
  expires: bigint;
}): Promise<Hex> {
  const sig = await sign({
    hash: signatureHash(opts.sender, opts.expires, opts.callData, opts.result),
    privateKey: opts.privateKey,
    to: 'hex',
  });
  return encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'uint64' }, { type: 'bytes' }],
    [opts.result, opts.expires, sig],
  );
}

/** Splits a signed response back into its parts (used by tests and the demo script). */
export function decodeResponse(response: Hex): { result: Hex; expires: bigint; sig: Hex } {
  const [result, expires, sig] = decodeAbiParameters(
    [{ type: 'bytes' }, { type: 'uint64' }, { type: 'bytes' }],
    response,
  );
  return { result, expires, sig };
}
