import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Тесты (vitest + jsdom) — зеркало web-client: алиас shared дублируется намеренно. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cleaning-ops/shared': fileURLToPath(new URL('../../shared/dist', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
