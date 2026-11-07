import { Injectable } from '@nestjs/common';
import type { Prisma } from '@muso/database';
import { randomUUID } from 'node:crypto';

export const accounts = {
  providerClearing: (provider: string) => `provider:${provider}:clearing`,
  creatorPending: (userId: string) => `creator:${userId}:pending`,
  creatorAvailable: (userId: string) => `creator:${userId}:available`,
  /** Paid straight to the creator's own wallet (USDC on Arc); MUSO never held it. */
  creatorWallet: (userId: string) => `creator:${userId}:wallet`,
  platformFees: 'platform:fees',
  poolEscrow: (poolId: string) => `pool:${poolId}:escrow`,
};

export interface LedgerLine {
  account: string;
  amountMinor: number;
  userId?: string | null;
}

/**
 * Double-entry, append-only ledger. A journal is one business event; its lines must sum to
 * zero (also enforced by a deferred DB trigger). Entries are never updated or deleted
 * (DB trigger) — corrections are new reversing journals.
 */
@Injectable()
export class LedgerService {
  async post(
    tx: Prisma.TransactionClient,
    event: string,
    currency: string,
    lines: LedgerLine[],
    refs: { paymentId?: string; earningId?: string } = {},
  ): Promise<string> {
    const nonZero = lines.filter((l) => l.amountMinor !== 0);
    const sum = nonZero.reduce((s, l) => s + l.amountMinor, 0);
    if (sum !== 0) throw new Error(`Unbalanced ledger journal for ${event}: ${sum}`);
    if (nonZero.some((l) => !Number.isInteger(l.amountMinor)))
      throw new Error('Ledger amounts must be integers');
    const journalId = randomUUID();
    await tx.ledgerEntry.createMany({
      data: nonZero.map((l) => ({
        journalId,
        account: l.account,
        userId: l.userId ?? null,
        amountMinor: l.amountMinor,
        currency,
        event,
        paymentId: refs.paymentId ?? null,
        earningId: refs.earningId ?? null,
      })),
    });
    return journalId;
  }
}
