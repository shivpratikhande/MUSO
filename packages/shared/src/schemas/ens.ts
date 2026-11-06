import { z } from 'zod';

/**
 * ENS: every MUSO creator gets a free subname, `<label>.<parent>` (e.g. `shiv-beats.muso.eth`),
 * served off-chain by MUSO's CCIP-Read gateway (ENSIP-10 + EIP-3668). It points at the
 * creator's linked payout wallet and carries their public profile as text records.
 */

/**
 * The ENS label for a username. Usernames allow `.` and `_`; ENS labels can't hold a `.`
 * (it would make another level) and only allow `_` at the start, so both become `-`.
 * Returns null when the result isn't a valid label (e.g. `ab__c` → `ab--c`, which ENS rejects).
 */
export function ensLabel(username: string): string | null {
  const label = username.toLowerCase().replace(/[._]/g, '-');
  if (!/^[a-z0-9-]{1,63}$/.test(label)) return null;
  if (label.startsWith('-') || label.endsWith('-')) return null;
  // ENSIP-15 / IDNA CheckHyphens: no "--" in the 3rd and 4th positions.
  if (label.slice(2, 4) === '--') return null;
  return label;
}

export type EnsChain = 'mainnet' | 'sepolia';

export interface EnsStatus {
  enabled: boolean;
  /** Parent name MUSO issues subnames under, e.g. `muso.eth`. */
  parentName: string;
  /** Ethereum network where the parent name and its resolver live. */
  chain: EnsChain;
  /** MUSO's OffchainResolver contract, once deployed. */
  resolver: string | null;
  /** Address whose signatures the resolver trusts (the gateway's signer). */
  signer: string | null;
  /** Gateway URL template to configure in the resolver contract. */
  gatewayUrl: string;
}

/** Result of a forward (name → address) or reverse (address → name) lookup. */
export interface EnsLookup {
  name: string | null;
  address: string | null;
  /** `muso`: a MUSO subname, answered from MUSO. `ens`: any other ENS name, read from Ethereum. */
  source: 'muso' | 'ens' | null;
}

/** The signed-in creator's MUSO subname and the records it serves. */
export interface MyEnsName {
  enabled: boolean;
  /** Null when ENS is off, no username is set, or the username can't be a label. */
  name: string | null;
  /** Payout wallet the name resolves to; null until a wallet is linked. */
  address: string | null;
  /** Text records served for the name (avatar, description, url, socials…). */
  records: Record<string, string>;
  /** Link to the name in the ENS app. */
  appUrl: string | null;
}

export const EnsResolveQuerySchema = z.object({
  name: z.string().trim().toLowerCase().min(3).max(255),
});
export type EnsResolveQuery = z.infer<typeof EnsResolveQuerySchema>;

export const EnsReverseParamSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'EVM address'),
});
