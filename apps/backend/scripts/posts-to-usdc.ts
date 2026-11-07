/**
 * Moves existing posts from ₹ prices to USDC on Arc (for PAYMENTS_CURRENCY=USD deployments):
 *   pnpm --filter @muso/backend posts:usdc            → shows what would change
 *   pnpm --filter @muso/backend posts:usdc --apply    → changes it
 * Prices convert at X402_INR_PER_USD (default 84), rounded up to the next 0.50 USDC and kept within the USDC
 * limits (0.50–100). Past payments and earnings keep their original currency. Uses DATABASE_URL.
 */
import { config } from 'dotenv';
import { MONEY_RULES, formatMoney } from '@muso/shared';
import { PrismaClient, createPgAdapter } from '@muso/database';

config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');
const rate = Number(process.env['X402_INR_PER_USD'] ?? 84);
const apply = process.argv.includes('--apply');
const { minPrice, maxPrice } = MONEY_RULES.USD;

/** Paise → USD cents at `rate`, rounded up to 50 cents, within the USDC price limits. */
const toUsd = (paise: number | null) =>
  paise === null
    ? null
    : Math.min(maxPrice, Math.max(minPrice, Math.ceil(paise / rate / 50) * 50));

const prisma = new PrismaClient({ adapter: createPgAdapter(url) });

async function main() {
  const posts = await prisma.post.findMany({
    where: { currency: 'INR', deletedAt: null },
    select: {
      id: true,
      caption: true,
      monetizationMode: true,
      priceMinor: true,
      suggestedMinor: true,
      minimumMinor: true,
    },
  });
  console.log(`${posts.length} posts in ₹ (rate ₹${rate} = 1 USDC)${apply ? '' : ' · dry run'}`);
  for (const p of posts) {
    const price = toUsd(p.priceMinor);
    const suggested = toUsd(p.suggestedMinor);
    let minimum = toUsd(p.minimumMinor);
    if (minimum !== null && suggested !== null && minimum > suggested) minimum = suggested;
    if (p.monetizationMode !== 'FREE')
      console.log(
        `  ${p.id.slice(0, 8)} ${p.monetizationMode.padEnd(17)} ${formatMoney(p.priceMinor ?? p.suggestedMinor ?? 0, 'INR').padStart(7)} → ${formatMoney(price ?? suggested ?? 0, 'USD')}  ${p.caption.slice(0, 40)}`,
      );
    if (apply)
      await prisma.post.update({
        where: { id: p.id },
        data: {
          currency: 'USD',
          priceMinor: price,
          suggestedMinor: suggested,
          minimumMinor: minimum,
        },
      });
  }
  console.log(
    apply ? 'Done: these posts are now priced in USDC.' : 'Run with --apply to change them.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
