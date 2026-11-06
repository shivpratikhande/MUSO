import { PrivateKey } from '@hiero-ledger/sdk';

/**
 * Parses a Hedera private key explicitly by type. A raw 32-byte hex key is ambiguous
 * (ECDSA secp256k1 vs ED25519), so we never guess: HEDERA_KEY_TYPE decides (portal
 * accounts are ECDSA). DER-encoded keys carry their type and parse either way.
 */
export function parseHederaKey(raw: string, type = process.env['HEDERA_KEY_TYPE'] ?? 'ecdsa'): PrivateKey {
  const key = raw.trim().replace(/^0x/i, '');
  if (type.toLowerCase() === 'ed25519') return PrivateKey.fromStringED25519(key);
  return PrivateKey.fromStringECDSA(key);
}
