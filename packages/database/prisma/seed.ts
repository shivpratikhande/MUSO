/**
 * Development seed data. Idempotent: safe to run repeatedly.
 * Never run against production.
 */
import { config } from 'dotenv';
import { createPrismaClient } from '../src/index.js';

config({ path: new URL('../../../.env', import.meta.url).pathname });

const GENRES: Array<[slug: string, name: string]> = [
  ['afrobeats', 'Afrobeats'],
  ['alternative', 'Alternative'],
  ['ambient', 'Ambient'],
  ['blues', 'Blues'],
  ['classical', 'Classical'],
  ['country', 'Country'],
  ['electronic', 'Electronic'],
  ['folk', 'Folk'],
  ['hip-hop', 'Hip-Hop'],
  ['house', 'House'],
  ['indie', 'Indie'],
  ['jazz', 'Jazz'],
  ['latin', 'Latin'],
  ['metal', 'Metal'],
  ['pop', 'Pop'],
  ['punk', 'Punk'],
  ['r-and-b', 'R&B'],
  ['reggae', 'Reggae'],
  ['rock', 'Rock'],
  ['soul', 'Soul'],
  ['techno', 'Techno'],
  ['world', 'World'],
];

async function main() {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to seed a production database.');
  }
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const prisma = createPrismaClient(url);
  try {
    for (const [slug, name] of GENRES) {
      await prisma.genre.upsert({ where: { slug }, update: { name }, create: { slug, name } });
    }
    console.log(`Seeded ${GENRES.length} genres.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
