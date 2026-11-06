import { config } from 'dotenv';

// Per-worker: force the test database and test mode before AppModule loads.
config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];
// Tests reach storage on localhost even when the dev .env points the phone at a LAN IP.
process.env['S3_PUBLIC_ENDPOINT'] = 'http://localhost:9000';
process.env['S3_AUTO_CREATE_BUCKETS'] = 'true';
process.env['PUBLIC_API_URL'] = 'http://localhost:4000';
