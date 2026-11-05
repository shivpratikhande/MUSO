import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load the repo-root .env so every package shares one DATABASE_URL.
config({ path: new URL('../../.env', import.meta.url).pathname });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
