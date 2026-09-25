import path from 'node:path';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenv.config({ path: path.resolve(__dirname, '.env'), override: false });

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node', // Use node environment for Server Actions
    setupFiles: ['./tests/mocks/server.ts'], // Auto-start MSW if configured globally
    include: ['tests/integration/**/*.test.{ts,tsx}'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
