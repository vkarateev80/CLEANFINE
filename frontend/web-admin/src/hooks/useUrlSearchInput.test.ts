import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUrlSearchInput } from './useUrlSearchInput';

/** Страница в миниатюре: `url` — значение `?search=`, commit пишет в него. */
function useHarness(initial: string, commits: string[]) {
  const [url, setUrl] = useState(initial);
  const [input, setInput] = useUrlSearchInput(url, (value) => {
    commits.push(value);
    setUrl(value);
  });
  return { url, setUrl, input, setInput };
}

describe('useUrlSearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('набранный текст не стирается после записи в URL (гонка 07.11.2026)', () => {
    const commits: string[] = [];
    const { result } = renderHook(() => useHarness('', commits));

    act(() => result.current.setInput('ЗИЛ'));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.url).toBe('ЗИЛ');
    expect(result.current.input).toBe('ЗИЛ');

    // Раньше здесь поле каждые ~300 мс прыгало между «» и «ЗИЛ».
    for (let tick = 0; tick < 10; tick += 1) {
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(result.current.input).toBe('ЗИЛ');
      expect(result.current.url).toBe('ЗИЛ');
    }
    expect(commits).toEqual(['ЗИЛ']);
  });

  it('промежуточные нажатия не пишутся в URL — только итог после паузы', () => {
    const commits: string[] = [];
    const { result } = renderHook(() => useHarness('', commits));

    act(() => result.current.setInput('З'));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => result.current.setInput('ЗИ'));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => result.current.setInput('ЗИЛ'));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(commits).toEqual(['ЗИЛ']);
  });

  it('внешняя смена URL («Назад», «Сбросить фильтры») переносится в поле без записи', () => {
    const commits: string[] = [];
    const { result } = renderHook(() => useHarness('офис', commits));
    expect(result.current.input).toBe('офис');

    act(() => result.current.setUrl('склад'));
    expect(result.current.input).toBe('склад');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.input).toBe('склад');
    expect(commits).toEqual([]);
  });

  it('сброс во время набора: поле пустое, недонабранный текст в URL не уходит', () => {
    const commits: string[] = [];
    const { result } = renderHook(() => useHarness('офис', commits));

    act(() => result.current.setInput('офис 2'));
    act(() => result.current.setUrl(''));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.input).toBe('');
    expect(result.current.url).toBe('');
    expect(commits).toEqual([]);
  });
});
