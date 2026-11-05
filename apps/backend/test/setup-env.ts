import { config } from 'dotenv';

// Per-worker: force the test database and test mode before AppModule loads.
config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];
