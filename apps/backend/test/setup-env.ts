import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';

// Per-worker: force the test database and test mode before AppModule loads.
config({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];
// Tests reach storage on localhost even when the dev .env points the phone at a LAN IP.
process.env['S3_PUBLIC_ENDPOINT'] = 'http://localhost:9000';
process.env['S3_AUTO_CREATE_BUCKETS'] = 'true';
process.env['PUBLIC_API_URL'] = 'http://localhost:4000';
process.env['X402_ENABLED'] = 'true';
process.env['X402_PAY_TO'] = '0.0.7777';
// World ID on, with test identifiers and a throwaway signing key (World's verifier is faked).
process.env['WORLD_ID_ENABLED'] = 'true';
process.env['WORLD_ID_APP_ID'] = 'app_staging_muso_test';
process.env['WORLD_ID_RP_ID'] = 'rp_muso_test';
process.env['WORLD_ID_SIGNING_KEY'] = randomBytes(32).toString('hex');
process.env['WORLD_ID_ENVIRONMENT'] = 'staging';
process.env['WORLD_ID_ACTION'] = 'muso-creator-rewards';
