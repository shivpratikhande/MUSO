import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@muso/database';
import {
  ensLabel,
  type EnsLookup,
  type EnsStatus,
  type MyEnsName,
  type ProfileLink,
} from '@muso/shared';
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  isHex,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';
import type { Env } from '../../config/env.js';
import { badRequest, notFound } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { RequestUser } from '../auth/auth.types.js';
import { answer, decodeGatewayRequest, signResponse, type EnsRecords } from './ens.codec.js';

/** Profile links on these hosts are published as the matching ENS text record. */
const SOCIAL_KEYS: Record<string, string> = {
  'x.com': 'com.twitter',
  'twitter.com': 'com.twitter',
  'instagram.com': 'com.instagram',
  'github.com': 'com.github',
  't.me': 'org.telegram',
  'youtube.com': 'com.youtube',
};

const LOOKUP_CACHE_MS = 10 * 60_000;
const LOOKUP_CACHE_MAX = 2_000;

/** `translate(username, '._', '--')` = the ENS label. Oldest account wins a shared label. */
const LABEL_SQL = Prisma.sql`translate(username, '._', '--')`;

@Injectable()
export class EnsService {
  private readonly logger = new Logger(EnsService.name);
  private l1: PublicClient | null = null;
  private readonly cache = new Map<string, { at: number; value: string | null }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get enabled(): boolean {
    return this.config.get('ENS_ENABLED', { infer: true });
  }

  get parent(): string {
    return this.config.get('ENS_PARENT_NAME', { infer: true });
  }

  private assertEnabled(): void {
    if (!this.enabled) throw notFound('That page');
  }

  status(): EnsStatus {
    const key = this.config.get('ENS_SIGNER_PRIVATE_KEY', { infer: true });
    const api = this.config.get('PUBLIC_API_URL', { infer: true }).replace(/\/$/, '');
    return {
      enabled: this.enabled,
      parentName: this.parent,
      chain: this.config.get('ENS_CHAIN', { infer: true }),
      resolver: this.config.get('ENS_RESOLVER_ADDRESS', { infer: true }) ?? null,
      signer: this.enabled && key ? privateKeyToAccount(key as Hex).address : null,
      gatewayUrl: `${api}/v1/ens/gateway/{sender}/{data}.json`,
    };
  }

  // ─────────── Names for MUSO users ───────────

  /** MUSO subnames for these users (only users who actually hold their label). */
  async namesFor(userIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!this.enabled || userIds.length === 0) return out;
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] }, deletedAt: null, username: { not: null } },
      select: { id: true, username: true },
    });
    const labelled = users
      .map((u) => ({ id: u.id, label: ensLabel(u.username!) }))
      .filter((u): u is { id: string; label: string } => u.label !== null);
    if (labelled.length === 0) return out;
    const holders = await this.holders(labelled.map((u) => u.label));
    for (const u of labelled) {
      if (holders.get(u.label) === u.id) out.set(u.id, `${u.label}.${this.parent}`);
    }
    return out;
  }

  async nameFor(userId: string): Promise<string | null> {
    return (await this.namesFor([userId])).get(userId) ?? null;
  }

  /** label → id of the account that holds it (the oldest one using it). */
  private async holders(labels: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.$queryRaw<{ label: string; id: string }[]>(Prisma.sql`
      SELECT DISTINCT ON (label) label, id::text AS id
      FROM (
        SELECT id, created_at, ${LABEL_SQL} AS label
        FROM users
        WHERE deleted_at IS NULL AND username IS NOT NULL
      ) t
      WHERE label = ANY(${labels}::text[])
      ORDER BY label, created_at, id`);
    return new Map(rows.map((r) => [r.label, r.id]));
  }

  async me(user: RequestUser): Promise<MyEnsName> {
    if (!this.enabled)
      return { enabled: false, name: null, address: null, records: {}, appUrl: null };
    const name = await this.nameFor(user.id);
    const records = name ? await this.recordsFor(name) : null;
    return {
      enabled: true,
      name,
      address: records?.address ?? null,
      records: records?.texts ?? {},
      appUrl: name ? this.appUrl(name) : null,
    };
  }

  private appUrl(name: string): string {
    const host =
      this.config.get('ENS_CHAIN', { infer: true }) === 'sepolia'
        ? 'https://sepolia.app.ens.domains'
        : 'https://app.ens.domains';
    return `${host}/${name}`;
  }

  /** Records for `name`, or null if MUSO doesn't serve it. */
  async recordsFor(name: string): Promise<EnsRecords | null> {
    const parent = this.parent;
    if (name === parent) {
      return {
        address: null,
        texts: {
          description: 'MUSO: capture the moment, share the experience, earn from your creativity.',
        },
      };
    }
    if (!name.endsWith(`.${parent}`)) return null;
    const label = name.slice(0, -parent.length - 1);
    if (label.includes('.') || ensLabel(label) !== label) return null;

    const id = (await this.holders([label])).get(label);
    if (!id) return null;
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        username: true,
        displayName: true,
        bio: true,
        avatarKey: true,
        city: true,
        showLocation: true,
        links: true,
        walletAddress: true,
      },
    });
    if (!u?.username) return null;

    const texts: Record<string, string> = { 'xyz.muso.username': u.username };
    if (u.displayName) texts['name'] = u.displayName;
    if (u.bio) texts['description'] = u.bio;
    const avatar = this.storage.publicUrl(u.avatarKey);
    if (avatar) texts['avatar'] = avatar;
    if (u.showLocation && u.city) texts['location'] = u.city;
    const links = (Array.isArray(u.links) ? u.links : []) as unknown as ProfileLink[];
    for (const link of links) {
      try {
        const url = new URL(link.url);
        const host = url.hostname.replace(/^www\./, '');
        const key = SOCIAL_KEYS[host];
        const handle = url.pathname.split('/').filter(Boolean)[0];
        if (key && handle && !texts[key]) texts[key] = handle.replace(/^@/, '');
        else if (!texts['url']) texts['url'] = link.url;
      } catch {
        // Links are validated on save; skip anything odd.
      }
    }
    return { address: u.walletAddress ? getAddress(u.walletAddress) : null, texts };
  }

  // ─────────── CCIP-Read gateway ───────────

  /** Answers one OffchainLookup and signs it for `sender` (the resolver contract). */
  async gateway(sender: string, data: string): Promise<Hex> {
    this.assertEnabled();
    if (!isAddress(sender, { strict: false })) throw badRequest('sender must be an address');
    if (!isHex(data)) throw badRequest('data must be 0x-prefixed hex');
    let request: { name: string; data: Hex };
    try {
      request = decodeGatewayRequest(data);
    } catch {
      throw badRequest('data is not a resolve(bytes,bytes) call');
    }
    const records = await this.recordsFor(request.name);
    let result: Hex;
    try {
      result = answer(request.name, request.data, records);
    } catch {
      throw badRequest('Unsupported resolver call');
    }
    const ttl = this.config.get('ENS_RESPONSE_TTL_SECONDS', { infer: true });
    return signResponse({
      privateKey: this.config.get('ENS_SIGNER_PRIVATE_KEY', { infer: true }) as Hex,
      sender: getAddress(sender),
      callData: data,
      result,
      expires: BigInt(Math.floor(Date.now() / 1000) + ttl),
    });
  }

  // ─────────── Lookups for the app ───────────

  /** Name → address. MUSO subnames are answered locally; other names are read from Ethereum. */
  async resolve(rawName: string): Promise<EnsLookup> {
    this.assertEnabled();
    let name: string;
    try {
      name = normalize(rawName);
    } catch {
      throw badRequest('That is not a valid ENS name');
    }
    if (name === this.parent || name.endsWith(`.${this.parent}`)) {
      const r = await this.recordsFor(name);
      return { name, address: r?.address ?? null, source: r ? 'muso' : null };
    }
    const address = await this.cached(`fwd:${name}`, async () =>
      this.client().getEnsAddress({ name }),
    );
    return { name, address, source: address ? 'ens' : null };
  }

  /** Address → name. A MUSO creator's subname first, then the address's ENS primary name. */
  async reverse(rawAddress: string): Promise<EnsLookup> {
    this.assertEnabled();
    const address = getAddress(rawAddress);
    const owner = await this.prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
      select: { id: true },
    });
    if (owner) {
      const name = await this.nameFor(owner.id);
      if (name) return { name, address, source: 'muso' };
    }
    const name = await this.cached(`rev:${address}`, async () =>
      this.client().getEnsName({ address }),
    );
    return { name, address, source: name ? 'ens' : null };
  }

  private client(): PublicClient {
    this.l1 ??= createPublicClient({
      chain: this.config.get('ENS_CHAIN', { infer: true }) === 'sepolia' ? sepolia : mainnet,
      transport: http(this.config.get('ENS_RPC_URL', { infer: true }), { timeout: 8_000 }),
    }) as PublicClient;
    return this.l1;
  }

  /** Small in-memory cache for Ethereum lookups; RPC failures read as "no name". */
  private async cached(key: string, load: () => Promise<string | null>): Promise<string | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < LOOKUP_CACHE_MS) return hit.value;
    let value: string | null;
    try {
      value = await load();
    } catch (err) {
      this.logger.warn({ err, key }, 'ENS lookup failed');
      return null;
    }
    if (this.cache.size >= LOOKUP_CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }
}
