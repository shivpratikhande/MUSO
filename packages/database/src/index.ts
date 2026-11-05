import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

/** node-postgres driver adapter (required by Prisma 7). */
export function createPgAdapter(databaseUrl: string): PrismaPg {
  return new PrismaPg({ connectionString: databaseUrl });
}

/**
 * Create a standalone Prisma client (scripts, seeds, tests).
 * The caller owns the lifecycle and must call `$disconnect()` on shutdown.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: createPgAdapter(databaseUrl) });
}
