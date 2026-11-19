import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'tools/*/src/**/*.test.ts', 'apps/pwa/src/**/*.test.ts'],
    env: { TZ: 'UTC' },
  },
});
