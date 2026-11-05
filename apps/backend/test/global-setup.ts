import { execSync } from 'node:child_process';
import { config } from 'dotenv';

/**
 * Runs once before the e2e suite: points the app at the isolated test database
 * and applies all migrations to it. Never touches the dev database.
 */
export default function setup(): void {
  config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });
  const testUrl = process.env['TEST_DATABASE_URL'];
  if (!testUrl) throw new Error('TEST_DATABASE_URL must be set for e2e tests');
  if (testUrl === process.env['DATABASE_URL']) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  }
  const env = { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test' };
  execSync('pnpm --filter @muso/database exec prisma migrate deploy', { stdio: 'inherit', env });
  // Reference data (genres). The seed is idempotent and reads DATABASE_URL from env first.
  execSync('pnpm --filter @muso/database db:seed', { stdio: 'inherit', env });
}
