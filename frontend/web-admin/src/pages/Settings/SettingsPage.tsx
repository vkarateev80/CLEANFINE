import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  SCHEDULE_TIME_ZONES,
  scheduleDayLabelOf,
  scheduleTimeOf,
  timeZoneTitle,
} from '@cleaning-ops/shared/types/time-zone';
import { updateScheduleSettings } from '../../api/schedule';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Card';
import { ErrorBanner, LoadingBlock, SoftWarning } from '../../components/ui/Feedback';
import { Field, Select } from '../../components/ui/Input';
import { SCHEDULE_SETTINGS_QUERY_KEY, useScheduleSettings } from '../../hooks/useScheduleSettings';
import { useTimeZoneStore } from '../../stores/timeZoneStore';

/**
 * «Настройки» (18.10.2026): часовой пояс расписания организации. В этом поясе
 * задаётся время начала в графиках, считаются день смены и «сегодня» у
 * операторов, показывается время в админке и портале заказчика.
 * Хранит schedule-service (`PATCH /api/schedule/settings`, только ADMIN).
 */
export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useScheduleSettings();
  const setTimeZone = useTimeZoneStore((s) => s.setTimeZone);
  const saved = settings.data?.timeZone ?? '';
  const [selected, setSelected] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (saved && !selected) setSelected(saved);
  }, [saved, selected]);

  // Часы предпросмотра: видно, который час в выбранном поясе прямо сейчас.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const options = useMemo(() => {
    const list = [...SCHEDULE_TIME_ZONES];
    if (saved && !list.some((item) => item.id === saved)) list.push({ id: saved, label: saved });
    return list;
  }, [saved]);

  const save = useMutation({
    mutationFn: (timeZone: string) => updateScheduleSettings(timeZone),
    onSuccess: (view) => {
      queryClient.setQueryData(SCHEDULE_SETTINGS_QUERY_KEY, view);
      setTimeZone(view.timeZone);
      // Смены, графики и отчёты пересчитают подписи и «сегодня» в новом поясе.
      void queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });

  const dirty = selected !== '' && selected !== saved;
  const updatedAt = settings.data?.updatedAt ?? null;
  // «Сохранено» — пока изменение свежее (последние 2 минуты).
  const justSaved = updatedAt !== null && now.getTime() - new Date(updatedAt).getTime() < 120_000;

  return (
    <div className="flex flex-col gap-6" data-testid="settings-page">
      <PageHeader title="Настройки" subtitle="Параметры организации, общие для всех сотрудников." />

      <Card className="flex max-w-2xl flex-col gap-4" testId="settings-time-zone">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Часовой пояс</h2>
          <p className="mt-1 text-sm text-neutral-500">
            В этом поясе задаётся время начала в графиках, считаются день смены и «сегодня» у
            операторов, показывается время смен в админке и в портале заказчика.
          </p>
        </div>

        {settings.isError ? (
          <ErrorBanner error={settings.error} onRetry={() => void settings.refetch()} />
        ) : settings.isLoading ? (
          <LoadingBlock label="Читаем настройки…" />
        ) : (
          <>
            <Field label="Часовой пояс организации" htmlFor="settings-time-zone-select" required>
              <Select
                id="settings-time-zone-select"
                data-testid="settings-time-zone-select"
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value);
                  save.reset();
                }}
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {timeZoneTitle(option.id, now)}
                  </option>
                ))}
              </Select>
            </Field>

            {selected && (
              <div className="text-sm text-neutral-600" data-testid="settings-time-zone-clock">
                Сейчас в этом поясе:{' '}
                <span className="font-mono font-medium text-neutral-900">
                  {scheduleTimeOf(now, selected)}, {scheduleDayLabelOf(now, selected)}
                </span>
              </div>
            )}

            {dirty && (
              <SoftWarning>
                Графики сохранят время «как на часах»: смена в 08:00 начнётся в 08:00 по новому поясу.
                Уже созданные смены не пересчитываются — при необходимости сгенерируйте их заново.
              </SoftWarning>
            )}

            {save.isError && <ErrorBanner error={save.error} />}
            {/* Из ответа сервера, а не из состояния мутации: после смены пояса
                каркас перемонтирует экран, и локальный «успех» потерялся бы. */}
            {!dirty && updatedAt && (
              <div
                className={`text-sm ${justSaved ? 'text-success-600' : 'text-neutral-500'}`}
                data-testid="settings-time-zone-saved"
              >
                {justSaved ? 'Сохранено. ' : ''}Изменён {scheduleDayLabelOf(updatedAt, saved)} в{' '}
                {scheduleTimeOf(updatedAt, saved)} ({settings.data?.timeZoneShortLabel})
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="primary"
                data-testid="settings-time-zone-save"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate(selected)}
              >
                {save.isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
              {dirty && (
                <Button variant="secondary" onClick={() => setSelected(saved)}>
                  Отменить
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
