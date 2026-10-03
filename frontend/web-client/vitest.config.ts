import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Тестовая конфигурация портала (vitest + jsdom) — зеркало web-admin.
 * Алиас `@cleaning-ops/shared` продублирован: vitest не читает vite.config.ts,
 * когда рядом есть vitest.config.ts, а ROLE_LABELS и статусы — рантайм-значения.
 */
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
