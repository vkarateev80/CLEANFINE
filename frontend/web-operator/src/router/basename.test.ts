import { describe, expect, it } from 'vitest';
import { routerBasename } from './index';

describe('routerBasename', () => {
  it('режет хвостовой слеш у базы k3s — адрес без слеша должен открываться', () => {
    expect(routerBasename('/app/')).toBe('/app');
    expect(routerBasename('/client/')).toBe('/client');
  });

  it('корень остаётся корнем', () => {
    expect(routerBasename('/')).toBe('/');
  });
});
