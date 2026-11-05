/**
 * Development helper: grant ADMIN (and mark the email verified) for an existing account.
 *   pnpm db:make-admin you@example.com
 */
import { config } from 'dotenv';
import { createPrismaClient } from '../src/index.js';

config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });

async function main() {
  if (process.env['NODE_ENV'] === 'production') throw new Error('Not available in production.');
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Usage: pnpm db:make-admin <email>');
  const prisma = createPrismaClient(process.env['DATABASE_URL']!);
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`No account with email ${email}`);
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role: 'ADMIN' } },
      update: {},
      create: { userId: user.id, role: 'ADMIN' },
    });
    if (!user.emailVerifiedAt)
      await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    console.log(`${email} is now an admin.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
