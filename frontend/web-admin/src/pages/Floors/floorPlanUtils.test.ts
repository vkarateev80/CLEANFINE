import { describe, expect, it } from 'vitest';
import { isSh3dFile, planFileError } from './floorPlanUtils';

describe('planFileError: .sh3d', () => {
  it('принимает Sweet Home 3D (расширение важнее MIME — его у .sh3d нет)', () => {
    const file = new File(['x'], 'план этажа.sh3d', { type: '' });
    expect(planFileError(file)).toBeNull();
    expect(isSh3dFile(file)).toBe(true);
  });

  it('принимает картинки как раньше', () => {
    expect(planFileError(new File(['x'], 'plan.png', { type: 'image/png' }))).toBeNull();
    expect(isSh3dFile(new File(['x'], 'plan.png'))).toBe(false);
  });

  it('чужие форматы по-прежнему отклоняются', () => {
    expect(planFileError(new File(['x'], 'evil.exe', { type: '' }))).toMatch(/Недопустимый/);
  });

  it('лимит 10 МБ действует и для .sh3d', () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.sh3d');
    expect(planFileError(big)).toBe('Файл больше 10 МБ');
  });
});
