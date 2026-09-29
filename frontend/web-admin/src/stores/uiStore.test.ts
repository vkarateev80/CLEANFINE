import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './uiStore';

/**
 * Смоук навигационного каркаса: drawer открывается из четырёх мест
 * (бургер, «Ещё», затемнение/Escape, смена маршрута) — все они сходятся
 * к одному флагу в сторе, здесь проверяется контракт этого флага.
 */
describe('uiStore — drawer навигации', () => {
  beforeEach(() => {
    useUiStore.setState({ drawerOpen: false });
  });

  it('стартовое состояние — drawer закрыт', () => {
    expect(useUiStore.getState().drawerOpen).toBe(false);
  });

  it('openDrawer / closeDrawer', () => {
    useUiStore.getState().openDrawer();
    expect(useUiStore.getState().drawerOpen).toBe(true);

    useUiStore.getState().closeDrawer();
    expect(useUiStore.getState().drawerOpen).toBe(false);
  });

  it('toggleDrawer меняет флаг', () => {
    useUiStore.getState().toggleDrawer();
    expect(useUiStore.getState().drawerOpen).toBe(true);

    useUiStore.getState().toggleDrawer();
    expect(useUiStore.getState().drawerOpen).toBe(false);
  });

  it('closeAll закрывает открытый drawer (смена маршрута)', () => {
    useUiStore.getState().openDrawer();
    useUiStore.getState().closeAll();
    expect(useUiStore.getState().drawerOpen).toBe(false);
  });
});
