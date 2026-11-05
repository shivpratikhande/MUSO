import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // e2e suites share one database; run them serially.
    fileParallelism: false,
    // Media processing (sharp/ffmpeg) runs for real in these tests.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
