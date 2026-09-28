import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountBadge, ObjectStatusBadge, RouteStatusBadge } from './Badge';

/**
 * Смоук бейджей статусов: подписи приходят из `@cleaning-ops/shared`
 * (единый словарь с бэкендом) — тест заодно проверяет, что алиас shared
 * резолвится и в тестовой сборке.
 */
describe('ObjectStatusBadge', () => {
  it('ACTIVE → «Активен»', () => {
    render(<ObjectStatusBadge status="ACTIVE" />);
    expect(screen.getByText('Активен')).toBeInTheDocument();
  });

  it('PAUSED → «Приостановлен»', () => {
    render(<ObjectStatusBadge status="PAUSED" />);
    expect(screen.getByText('Приостановлен')).toBeInTheDocument();
  });

  it('ARCHIVED → «В архиве»', () => {
    render(<ObjectStatusBadge status="ARCHIVED" />);
    expect(screen.getByText('В архиве')).toBeInTheDocument();
  });
});

describe('RouteStatusBadge', () => {
  it('DRAFT → «Черновик»', () => {
    render(<RouteStatusBadge status="DRAFT" />);
    expect(screen.getByText('Черновик')).toBeInTheDocument();
  });
});

describe('CountBadge', () => {
  it('рисует значение и единицу измерения', () => {
    render(<CountBadge value={3} unit="операции" />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('операции')).toBeInTheDocument();
  });
});
