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

const DEMO_DOMAIN = '@demo.muso';
const HOUR = 3_600_000;

/**
 * Demo artists, an organizer and a few approved events so the app isn't empty in development.
 * Demo accounts have no password and cannot sign in. Re-running replaces the demo events.
 */
async function seedDemo(prisma: ReturnType<typeof createPrismaClient>) {
  const genre = async (slug: string) =>
    (await prisma.genre.findUniqueOrThrow({ where: { slug } })).id;

  const artists = [
    {
      handle: 'nila.waves',
      name: 'Nila Waves',
      city: 'Mumbai',
      genres: ['indie', 'electronic'],
      bio: 'Dream-pop duo from Bandra. Synths, tape loops and monsoon melancholy.',
    },
    {
      handle: 'the.brass.republic',
      name: 'The Brass Republic',
      city: 'Bengaluru',
      genres: ['jazz', 'soul'],
      bio: 'Nine-piece brass band. Loud, sweaty, joyful.',
    },
    {
      handle: 'kavya.k',
      name: 'Kavya K',
      city: 'Delhi',
      genres: ['hip-hop', 'r-and-b'],
      bio: 'Rapper and producer. Bilingual bars over warm boom-bap.',
    },
    {
      handle: 'saltwater.static',
      name: 'Saltwater Static',
      city: 'Goa',
      genres: ['house', 'techno'],
      bio: 'Sunrise sets on the beach. Deep house to driving techno.',
    },
  ];

  const artistIds: string[] = [];
  for (const a of artists) {
    const user = await prisma.user.upsert({
      where: { email: `${a.handle}${DEMO_DOMAIN}` },
      update: {},
      create: {
        email: `${a.handle}${DEMO_DOMAIN}`,
        username: a.handle,
        displayName: a.name,
        bio: a.bio,
        city: a.city,
        country: 'IN',
        emailVerifiedAt: new Date(),
        onboardedAt: new Date(),
        roles: { create: [{ role: 'ARTIST' }, { role: 'SUPPORTER' }] },
      },
    });
    const profile = await prisma.artistProfile.upsert({
      where: { userId: user.id },
      update: { stageName: a.name },
      create: {
        userId: user.id,
        stageName: a.name,
        contentUsagePolicy: 'FAN_MONETIZATION_ALLOWED',
      },
    });
    await prisma.artistGenre.deleteMany({ where: { artistId: profile.id } });
    await prisma.artistGenre.createMany({
      data: await Promise.all(
        a.genres.map(async (g) => ({ artistId: profile.id, genreId: await genre(g) })),
      ),
    });
    artistIds.push(profile.id);
  }

  const organizer = await prisma.user.upsert({
    where: { email: `live.nation.local${DEMO_DOMAIN}` },
    update: {},
    create: {
      email: `live.nation.local${DEMO_DOMAIN}`,
      username: 'nightowl.presents',
      displayName: 'Night Owl Presents',
      city: 'Mumbai',
      country: 'IN',
      emailVerifiedAt: new Date(),
      onboardedAt: new Date(),
      roles: { create: [{ role: 'ORGANIZER' }, { role: 'SUPPORTER' }] },
      organizerProfile: {
        create: { organizationName: 'Night Owl Presents', contactEmail: 'hello@nightowl.example' },
      },
    },
  });

  await prisma.event.deleteMany({ where: { organizerId: organizer.id } });
  const now = Date.now();
  const events = [
    {
      title: 'Monsoon Sessions',
      venue: 'Antisocial',
      city: 'Mumbai',
      start: -HOUR,
      end: 4 * HOUR,
      lineup: [0, 2],
      policy: 'ALLOWED' as const,
      description:
        'An intimate night of dream-pop and hip-hop while the rain comes down. Doors 7pm.',
    },
    {
      title: 'Brass on the Lawn',
      venue: 'Phoenix Arena Lawns',
      city: 'Bengaluru',
      start: 3 * 24 * HOUR,
      end: 3 * 24 * HOUR + 6 * HOUR,
      lineup: [1],
      policy: 'PHOTOS_ONLY' as const,
      description: 'Open-air afternoon with The Brass Republic. Bring a blanket.',
    },
    {
      title: 'Sunrise Shoreline',
      venue: 'Vagator Beach',
      city: 'Goa',
      start: 10 * 24 * HOUR,
      end: 10 * 24 * HOUR + 10 * HOUR,
      lineup: [3, 0],
      policy: 'ALLOWED' as const,
      description: 'All-night beach party ending at sunrise. Deep house into techno.',
    },
    {
      title: 'Delhi Underground Vol. 3',
      venue: 'Summer House Café',
      city: 'Delhi',
      start: -9 * 24 * HOUR,
      end: -9 * 24 * HOUR + 5 * HOUR,
      lineup: [2],
      policy: 'ALLOWED' as const,
      description: 'The third edition of our hip-hop showcase.',
    },
  ];
  for (const e of events) {
    await prisma.event.create({
      data: {
        organizerId: organizer.id,
        title: e.title,
        description: e.description,
        venueName: e.venue,
        city: e.city,
        country: 'IN',
        startsAt: new Date(now + e.start),
        endsAt: new Date(now + e.end),
        recordingPolicy: e.policy,
        reviewStatus: 'APPROVED',
        reviewedAt: new Date(),
        artists: { create: e.lineup.map((i, position) => ({ artistId: artistIds[i]!, position })) },
      },
    });
  }
  console.log(`Seeded ${artists.length} demo artists, 1 organizer, ${events.length} events.`);
}

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
    if (process.env['NODE_ENV'] !== 'test' && process.env['SEED_DEMO'] !== '0') {
      await seedDemo(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
