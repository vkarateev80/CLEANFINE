import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Тестовая конфигурация web-admin (vitest + jsdom).
 *
 * Отдельный файл, а не блок `test` в vite.config.ts: сборка `vite build`
 * не должна зависеть от тестовых плагинов. Алиас `@cleaning-ops/shared`
 * продублирован намеренно — vitest не читает vite.config.ts, когда рядом
 * есть vitest.config.ts, а статусы домена (OBJECT_STATUS_LABELS и др.)
 * импортируются через этот алиас в рантайме.
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
