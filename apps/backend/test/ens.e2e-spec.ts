import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  decodeAbiParameters,
  encodeFunctionData,
  getAddress,
  namehash,
  recoverAddress,
  concatHex,
  stringToHex,
  toHex,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { PrismaService } from '../src/database/prisma.service.js';
import {
  GATEWAY_ABI,
  RESOLVER_ABI,
  decodeResponse,
  signatureHash,
} from '../src/modules/ens/ens.codec.js';
import { cleanupTestUsers, createTestApp, makeUser, uniq } from './helpers.js';

const RESOLVER = '0x1111111111111111111111111111111111111111';
const WALLET = privateKeyToAccount(`0x${'ab'.repeat(32)}`).address;
const ARC_COIN_TYPE = 0x8000_0000n | 5_042_002n;

/** DNS wire format (ENSIP-10): length-prefixed labels, 0-terminated. */
const dnsEncode = (name: string): Hex =>
  concatHex([
    ...name
      .split('.')
      .flatMap((l) => [toHex(new TextEncoder().encode(l).length, { size: 1 }), stringToHex(l)]),
    '0x00',
  ]);

/** What a CCIP-Read client sends: resolve(dnsEncode(name), innerCall). */
const callData = (name: string, inner: Hex) =>
  encodeFunctionData({
    abi: GATEWAY_ABI,
    functionName: 'resolve',
    args: [dnsEncode(name), inner],
  });
const addrCall = (name: string) =>
  encodeFunctionData({ abi: RESOLVER_ABI, functionName: 'addr', args: [namehash(name)] });
const coinCall = (name: string, coinType: bigint) =>
  encodeFunctionData({ abi: RESOLVER_ABI, functionName: 'addr', args: [namehash(name), coinType] });
const textCall = (name: string, key: string) =>
  encodeFunctionData({ abi: RESOLVER_ABI, functionName: 'text', args: [namehash(name), key] });

describe('ENS subnames + CCIP-Read gateway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const signer = privateKeyToAccount(process.env['ENS_SIGNER_PRIVATE_KEY'] as Hex).address;

  /** Asks the gateway like a client would, checks the signature, returns the raw result. */
  async function ask(name: string, inner: Hex): Promise<Hex> {
    const data = callData(name, inner);
    const res = await http().get(`/v1/ens/gateway/${RESOLVER}/${data}.json`).expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    const { result, expires, sig } = decodeResponse(res.body.data);
    const now = BigInt(Math.floor(Date.now() / 1000));
    expect(expires).toBeGreaterThan(now);
    expect(expires).toBeLessThanOrEqual(now + 301n);
    const recovered = await recoverAddress({
      hash: signatureHash(RESOLVER, expires, data, result),
      signature: sig,
    });
    expect(recovered).toBe(signer);
    return result;
  }
  const asAddress = (r: Hex) => decodeAbiParameters([{ type: 'address' }], r)[0];
  const asBytes = (r: Hex) => decodeAbiParameters([{ type: 'bytes' }], r)[0];
  const asText = (r: Hex) => decodeAbiParameters([{ type: 'string' }], r)[0];

  /** A user with a username like `ens.ab12_x` → label `ens-ab12-x`. */
  async function creator(over: Record<string, unknown> = {}) {
    const u = await makeUser(app, prisma);
    const username = `${uniq('ens.')}_x`;
    await prisma.user.update({ where: { id: u.id }, data: { username, ...over } });
    return { ...u, username, name: `${username.replace(/[._]/g, '-')}.muso.eth` };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  it('publishes its status: parent name, signer and the gateway URL template', async () => {
    const body = (await http().get('/v1/ens/status').expect(200)).body.data;
    expect(body).toMatchObject({ enabled: true, parentName: 'muso.eth', chain: 'sepolia', signer });
    expect(body.gatewayUrl).toMatch(/\/v1\/ens\/gateway\/\{sender\}\/\{data\}\.json$/);
  });

  it('gives a creator a subname that resolves to their linked wallet, with profile records', async () => {
    const c = await creator({
      displayName: 'Shiv Beats',
      bio: 'Front row at every gig',
      city: 'Mumbai',
      avatarKey: 'avatars/ens-test.png',
      links: [
        { label: 'X', url: 'https://x.com/shivbeats' },
        { label: 'Site', url: 'https://shiv.example' },
      ],
    });

    // No wallet yet: the name exists, but resolves to the zero address.
    let me = (await http().get('/v1/me/ens').set(c.auth).expect(200)).body.data;
    expect(me).toMatchObject({ enabled: true, name: c.name, address: null });
    expect(asAddress(await ask(c.name, addrCall(c.name)))).toBe(
      '0x0000000000000000000000000000000000000000',
    );

    await prisma.user.update({
      where: { id: c.id },
      data: { walletAddress: WALLET.toLowerCase(), walletLinkedAt: new Date() },
    });
    me = (await http().get('/v1/me/ens').set(c.auth).expect(200)).body.data;
    expect(me.address).toBe(WALLET);
    expect(me.appUrl).toBe(`https://sepolia.app.ens.domains/${c.name}`);
    expect((await http().get('/v1/me/wallet').set(c.auth).expect(200)).body.data.ensName).toBe(
      c.name,
    );

    expect(asAddress(await ask(c.name, addrCall(c.name)))).toBe(WALLET);
    // Ethereum (60), Arc via ENSIP-11, and the ENSIP-19 EVM default all give the wallet; BTC (0) doesn't.
    for (const coin of [60n, ARC_COIN_TYPE, 0x8000_0000n]) {
      expect((asBytes(await ask(c.name, coinCall(c.name, coin))) as string).toLowerCase()).toBe(
        WALLET.toLowerCase(),
      );
    }
    expect(asBytes(await ask(c.name, coinCall(c.name, 0n)))).toBe('0x');

    expect(asText(await ask(c.name, textCall(c.name, 'name')))).toBe('Shiv Beats');
    expect(asText(await ask(c.name, textCall(c.name, 'description')))).toBe(
      'Front row at every gig',
    );
    expect(asText(await ask(c.name, textCall(c.name, 'location')))).toBe('Mumbai');
    expect(asText(await ask(c.name, textCall(c.name, 'avatar')))).toContain('avatars/ens-test.png');
    expect(asText(await ask(c.name, textCall(c.name, 'com.twitter')))).toBe('shivbeats');
    expect(asText(await ask(c.name, textCall(c.name, 'url')))).toBe('https://shiv.example');
    expect(asText(await ask(c.name, textCall(c.name, 'xyz.muso.username')))).toBe(c.username);
    expect(asText(await ask(c.name, textCall(c.name, 'com.github')))).toBe('');
  });

  it('respects hidden location and deleted accounts', async () => {
    const c = await creator({ city: 'Pune', showLocation: false });
    expect(asText(await ask(c.name, textCall(c.name, 'location')))).toBe('');
    await prisma.user.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
    expect(asText(await ask(c.name, textCall(c.name, 'xyz.muso.username')))).toBe('');
  });

  it('gives a shared label to the older account only', async () => {
    const older = await makeUser(app, prisma);
    const newer = await makeUser(app, prisma);
    const base = uniq('col');
    await prisma.user.update({
      where: { id: older.id },
      data: { username: `${base}.a`, createdAt: new Date(Date.now() - 60_000) },
    });
    await prisma.user.update({ where: { id: newer.id }, data: { username: `${base}_a` } });
    const name = `${base}-a.muso.eth`;
    expect((await http().get('/v1/me/ens').set(older.auth).expect(200)).body.data.name).toBe(name);
    expect((await http().get('/v1/me/ens').set(newer.auth).expect(200)).body.data.name).toBeNull();
    expect(asText(await ask(name, textCall(name, 'xyz.muso.username')))).toBe(`${base}.a`);
  });

  it('answers unknown names, other parents and mismatched nodes with empty (but signed) records', async () => {
    const c = await creator();
    await prisma.user.update({
      where: { id: c.id },
      data: { walletAddress: `0x${'cd'.repeat(20)}`, walletLinkedAt: new Date() },
    });
    const zero = '0x0000000000000000000000000000000000000000';
    expect(asAddress(await ask('nobody-here.muso.eth', addrCall('nobody-here.muso.eth')))).toBe(
      zero,
    );
    expect(asAddress(await ask('deep.' + c.name, addrCall('deep.' + c.name)))).toBe(zero);
    const label = c.name.split('.')[0]!;
    expect(asAddress(await ask(`${label}.other.eth`, addrCall(`${label}.other.eth`)))).toBe(zero);
    // Node for a different name than the one asked: never leak another name's records.
    expect(asAddress(await ask(c.name, addrCall('someone-else.muso.eth')))).toBe(zero);
    expect(asText(await ask('muso.eth', textCall('muso.eth', 'description')))).toContain('MUSO');
  });

  it('accepts the POST form and rejects malformed requests', async () => {
    const c = await creator();
    const data = callData(c.name, textCall(c.name, 'xyz.muso.username'));
    const res = await http().post('/v1/ens/gateway').send({ sender: RESOLVER, data }).expect(200);
    expect(asText(decodeResponse(res.body.data).result)).toBe(c.username);

    await http().get(`/v1/ens/gateway/not-an-address/${data}.json`).expect(400);
    await http().get(`/v1/ens/gateway/${RESOLVER}/0x1234.json`).expect(400);
    await http().get(`/v1/ens/gateway/${RESOLVER}/hello.json`).expect(400);
    // A resolver call MUSO doesn't serve (e.g. ABI()).
    const abiCall = `0x2203ab56${namehash(c.name).slice(2)}${'0'.repeat(63)}1` as Hex;
    await http()
      .get(`/v1/ens/gateway/${RESOLVER}/${callData(c.name, abiCall)}.json`)
      .expect(400);
  });

  it('looks up MUSO names both ways without touching Ethereum', async () => {
    const c = await creator();
    const wallet = `0x${'ef'.repeat(20)}`;
    await prisma.user.update({
      where: { id: c.id },
      data: { walletAddress: wallet, walletLinkedAt: new Date() },
    });
    const fwd = (
      await http().get('/v1/ens/resolve').query({ name: c.name.toUpperCase() }).expect(200)
    ).body.data;
    expect(fwd).toEqual({ name: c.name, address: getAddress(wallet), source: 'muso' });
    const rev = (await http().get(`/v1/ens/reverse/${wallet}`).expect(200)).body.data;
    expect(rev).toMatchObject({ name: c.name, source: 'muso' });
    await http().get('/v1/ens/resolve').query({ name: 'bad name!.eth' }).expect(400);
  });
});
