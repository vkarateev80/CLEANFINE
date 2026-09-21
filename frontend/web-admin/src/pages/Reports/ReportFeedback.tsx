import { ErrorBanner, SoftWarning } from '../../components/ui';
import { apiStatus } from './reportsHelpers';

/**
 * Общие части вкладок отчёта: обратная связь (ошибка/устаревшие данные) и показатель в
 * шапке. Вынесены из `ReportsPage`, чтобы каждая вкладка жила своим файлом, а поведение
 * при ошибке было одинаковым во всех четырёх: раздел открывается одним взглядом, и
 * «в одном отчёте ошибка видна, а в другом нет» — это дефект, а не разница экранов.
 */

/** Ошибка с повтором или предупреждение об устаревших данных. */
export function ReportFeedback({
  error,
  isError,
  isRefetchError,
  refetch,
}: {
  error: unknown;
  isError: boolean;
  isRefetchError: boolean;
  refetch: () => void;
}) {
  const forbidden = apiStatus(error) === 403;
  return (
    <>
      {isError && (
        <ErrorBanner
          error={forbidden ? new Error('Недостаточно прав для просмотра отчёта') : error}
          onRetry={refetch}
        />
      )}
      {!isError && isRefetchError && (
        <SoftWarning>Данные отчёта могут быть неактуальны — обновите страницу.</SoftWarning>
      )}
    </>
  );
}

/** Показатель в шапке отчёта: подпись сверху, значение моноширинным. */
export function Metric({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="font-mono text-lg text-neutral-900" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}
