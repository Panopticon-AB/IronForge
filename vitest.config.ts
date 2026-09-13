import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    mockReset: true,
    alias: {
      '@': path.resolve(dirname, './src'),
      '@clerk/nextjs/server': path.resolve(dirname, './tests/mocks/clerk.ts'),
    },
    exclude: [
      '**/node_modules/**',
      '**/tests/e2e/**',
      '**/tests/integration/**',
      '**/*.stories.tsx',
      '**/*.stories.ts',
      '**/build/**',
      '**/dist/**',
      '**/tmp/**',
      'scripts/ci/**/*.test.mjs',
    ],

    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
    },
  },
});
