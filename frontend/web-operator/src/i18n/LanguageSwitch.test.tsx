import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageSwitch } from './LanguageSwitch';
import { t, useLangStore } from './index';

/** Переключатель RU · KY · UZ меняет язык всех `t()` и помечает активный сегмент. */
describe('LanguageSwitch', () => {
  afterEach(() => useLangStore.setState({ lang: 'ru' }));

  it('переключает язык и переводит строки', () => {
    render(<LanguageSwitch />);
    expect(t('Войти')).toBe('Войти');
    expect(screen.getByTestId('language-ru').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByTestId('language-ky'));
    expect(useLangStore.getState().lang).toBe('ky');
    expect(t('Войти')).toBe('Кирүү');
    expect(screen.getByTestId('language-ky').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByTestId('language-uz'));
    expect(t('Войти')).toBe('Kirish');
    expect(t('Сегодня')).toBe('Bugun');
  });
});
