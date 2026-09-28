import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Auto-cleanup есть только при vitest globals:true; мы импортируем API явно,
// поэтому вычищаем DOM после каждого теста сами.
afterEach(() => {
  cleanup();
});

/**
 * Node 22+ (в частности v26 на dev-машине) объявляет на globalThis свой
 * экспериментальный геттер `localStorage`; без `--localstorage-file` он
 * возвращает undefined и «перебивает» хранилище jsdom — zustand persist
 * в authStore падает на localStorage.clear(). В CI (Node 20) геттера нет,
 * условие ложно и полифил не срабатывает: работает штатное хранилище jsdom.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

if (typeof localStorage === 'undefined') {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  if (typeof window !== 'undefined' && window !== (globalThis as unknown as Window)) {
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}
