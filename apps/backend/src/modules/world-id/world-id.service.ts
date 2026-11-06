import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@muso/database';
import type { HumanStatus, VerifyHumanInput, WorldIdContext } from '@muso/shared';
import { hashSignal } from '@worldcoin/idkit-core/hashing';
import { Nullifier } from '@worldcoin/idkit-core/nullifier';
import { signRequest } from '@worldcoin/idkit-core/signing';
import { privateKeyToAccount } from 'viem/accounts';
import type { Env } from '../../config/env.js';
import { badRequest, conflict, isUniqueViolation } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { WORLD_ID_VERIFIER, type WorldIdVerifier } from './world-id.verifier.js';

/**
 * World ID proof of human (IDKit v4). The server signs each request (the signing key never
 * leaves it), binds the proof to the signed-in account through the signal, forwards the IDKit
 * result unchanged to World's verifier, and stores the action-scoped nullifier with a unique
 * constraint, so one human can verify only one MUSO account.
 */
@Injectable()
export class WorldIdService implements OnModuleInit {
  private readonly logger = new Logger(WorldIdService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(WORLD_ID_VERIFIER) private readonly verifier: WorldIdVerifier,
  ) {}

  onModuleInit(): void {
    if (this.enabled)
      this.logger.log(
        `World ID on (${this.environment}, action "${this.action}", signer ${this.signerAddress()})`,
      );
  }

  /** Public address of the RP signing key: must match "Signer address" in the Developer Portal. */
  signerAddress(): string {
    const key = this.config.get('WORLD_ID_SIGNING_KEY', { infer: true });
    if (!key) return 'none';
    return privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`).address;
  }

  private get enabled(): boolean {
    return this.config.get('WORLD_ID_ENABLED', { infer: true });
  }
  private get action(): string {
    return this.config.get('WORLD_ID_ACTION', { infer: true });
  }
  private get environment(): 'production' | 'staging' | 'sandbox' {
    return this.config.get('WORLD_ID_ENVIRONMENT', { infer: true });
  }

  async status(user: RequestUser): Promise<HumanStatus> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { humanVerifiedAt: true },
    });
    return {
      enabled: this.enabled,
      verified: !!u.humanVerifiedAt,
      verifiedAt: u.humanVerifiedAt?.toISOString() ?? null,
    };
  }

  /** A fresh, signed request context (valid ~5 minutes). */
  context(user: RequestUser): WorldIdContext {
    if (!this.enabled) throw badRequest('World ID is not enabled on this server');
    const key = this.config.get('WORLD_ID_SIGNING_KEY', { infer: true })!;
    const sig = signRequest({
      signingKeyHex: key.startsWith('0x') ? key : `0x${key}`,
      action: this.action,
    });
    return {
      app_id: this.config.get('WORLD_ID_APP_ID', { infer: true })!,
      action: this.action,
      environment: this.environment,
      signal: user.id,
      rp_context: {
        rp_id: this.config.get('WORLD_ID_RP_ID', { infer: true })!,
        nonce: sig.nonce,
        created_at: sig.createdAt,
        expires_at: sig.expiresAt,
        signature: sig.sig,
      },
    };
  }

  async verify(user: RequestUser, input: VerifyHumanInput): Promise<HumanStatus> {
    if (!this.enabled) throw badRequest('World ID is not enabled on this server');
    const current = await this.status(user);
    if (current.verified) return current;
    const result = input.result as Record<string, unknown> & {
      environment: string;
      responses: Record<string, unknown>[];
    };
    const fail = (why: string) => badRequest(`World ID verification failed: ${why}`);

    // Cheap local checks first; World's verifier is the source of truth for the proof itself.
    if (result.environment !== this.environment) throw fail('wrong environment');
    if (result['action'] !== undefined && result['action'] !== this.action)
      throw fail('wrong action');
    const proof = result.responses.find((r) => typeof r['nullifier'] === 'string');
    if (!proof) throw fail('no proof of uniqueness in the result');
    // The signal binds the proof to this account, so a proof can't be replayed for another one.
    if (proof['signal_hash'] !== hashSignal(user.id))
      throw fail('this proof was made for another account');

    const { status, json } = await this.verifier.verify(
      this.config.get('WORLD_ID_RP_ID', { infer: true })!,
      {
        ...result,
        environment: this.environment,
      },
    );
    if (status >= 400 || json.success !== true || json.environment !== this.environment) {
      this.logger.warn(
        `World ID verify rejected (${status}): ${json.code ?? ''} ${json.detail ?? ''}`,
      );
      throw fail(json.detail ?? json.code ?? 'the proof was not accepted');
    }
    const hex =
      json.nullifier ??
      json.results?.find((r) => r.success && r.nullifier)?.nullifier ??
      (proof['nullifier'] as string);
    let nullifier: bigint;
    try {
      nullifier = Nullifier.fromHex(hex).toBigInt();
    } catch {
      throw fail('invalid nullifier');
    }

    try {
      await this.prisma.$transaction([
        this.prisma.humanVerification.create({
          data: {
            userId: user.id,
            action: this.action,
            nullifier: new Prisma.Decimal(nullifier.toString()),
            credential: String(proof['identifier'] ?? 'proof_of_human'),
            environment: this.environment,
          },
        }),
        this.prisma.user.update({ where: { id: user.id }, data: { humanVerifiedAt: new Date() } }),
      ]);
    } catch (err) {
      if (isUniqueViolation(err))
        throw conflict('This World ID is already verifying another MUSO account');
      throw err;
    }
    this.logger.log(`User ${user.id} verified as a unique human (World ID, ${this.environment})`);
    return this.status(user);
  }
}
