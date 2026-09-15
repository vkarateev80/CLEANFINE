import { apiClient } from './client';
import type {
  ConsumptionReport,
  ReportQuery,
  StocksQuery,
  StockView,
} from '../types/materials';

/**
 * Клиент material-service (:3007 через прокси `/api/materials`). Портал читает
 * только отчёт по расходу и остатки: приход/расход/списание делает админка или
 * оператор, у клиента мутаций материалов нет (DS-004, `overview.md` п. 2).
 */

/**
 * Отчёт по расходу материалов по объекту за период — агрегат `OUT`/`WRITE_OFF`
 * (`GET /api/materials/report`). Это единственный серверный агрегат, доступный
 * порталу: отчёт по заявкам и сменам считается на клиенте.
 */
export function getConsumptionReport(query: ReportQuery = {}): Promise<ConsumptionReport> {
  return apiClient.get('/materials/report', { params: query }).then((r) => r.data);
}

/**
 * Остатки по объекту. `onlyLow` уходит ТОЛЬКО значением `true`: в
 * `StocksQueryDto` стоит `@Type(() => Boolean)`, а `Boolean('false') === true` —
 * `onlyLow=false` в query-строке включил бы фильтр вместо того, чтобы выключить
 * его (то же решение, что в `web-admin/src/api/materials.ts`).
 */
export function listStocks(query: StocksQuery = {}): Promise<{ items: StockView[]; total: number }> {
  return apiClient
    .get('/materials/stocks', {
      params: {
        ...(query.objectId ? { objectId: query.objectId } : {}),
        ...(query.onlyLow ? { onlyLow: true } : {}),
      },
    })
    .then((r) => r.data);
}
