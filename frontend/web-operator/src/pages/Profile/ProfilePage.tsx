import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@cleaning-ops/shared/types/roles';
import { logout } from '../../api/auth';
import { getNotificationSettings, updateNotificationSettings } from '../../api/notifications';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorBanner, errorMessage } from '../../components/ui/Feedback';
import { Sheet } from '../../components/ui/Sheet';
import { useHeaderTitle } from '../../hooks/useHeaderTitle';
import { useOnline } from '../../hooks/useOnline';
import { plural } from '../../lib/date';
import { useAuthStore } from '../../stores/authStore';
import { useProgressStore } from '../../stores/progressStore';
import { usePendingCount, useQueueStore } from '../../stores/queueStore';
import { useUiStore } from '../../stores/uiStore';
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from '../../types/notifications';
import { useInstallPrompt } from './useInstallPrompt';

const APP_VERSION = '1.0.0 (web)';

/** Подписи типов уведомлений оператора (profile.md §7); CHAT_MESSAGE нет в словаре портала. */
const TYPE_LABELS: Record<string, string> = {
  ...NOTIFICATION_TYPE_LABELS,
  CHAT_MESSAGE: 'Сообщения в чате',
  EMERGENCY: 'Аварийные заявки',
  NEW_TICKET: 'Новые заявки',
  TICKET_OVERDUE: 'Просроченные заявки',
  GEOFENCE_EXIT: 'Выход из геозоны',
  MATERIAL_LOW: 'Материал ниже нормы',
  SCHEDULE_MISSED: 'Неявка на смену',
};

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

function useGeoPermission(): GeoPermission {
  const [state, setState] = useState<GeoPermission>('unknown');
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return undefined;
    let status: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        status = result;
        setState(result.state);
        result.onchange = () => setState(result.state);
      })
      .catch(() => setState('unknown'));
    return () => {
      if (status) status.onchange = null;
    };
  }, []);
  return state;
}

const GEO_TEXT: Record<GeoPermission, string> = {
  granted: 'Разрешено',
  denied: 'Отклонено — отметка на смене и SOS не сработают',
  prompt: 'Браузер спросит при первой отметке',
  unknown: 'Статус неизвестен',
};

/** Профиль (profile.md): кто я, доступ, геолокация, уведомления, очередь, выход. */
export function ProfilePage() {
  useHeaderTitle('Профиль');
  const user = useAuthStore((s) => s.user);
  const pending = usePendingCount();
  const online = useOnline();
  const navigate = useNavigate();
  const geo = useGeoPermission();
  const install = useInstallPrompt();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const clearQueue = useQueueStore((s) => s.clearAll);
  const clearProgress = useProgressStore((s) => s.clearAll);

  if (!user) return null;

  async function handleLogout() {
    setLeaving(true);
    try {
      await logout();
      // Локальные данные оператора не должны остаться на чужом телефоне.
      clearQueue();
      clearProgress();
      navigate('/login', { replace: true });
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
            data-testid="profile_avatar_image"
          />
        ) : (
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-semibold text-primary-700"
            aria-hidden="true"
          >
            {initials(user.fullName)}
          </div>
        )}
        <div className="min-w-0">
          <div
            className="truncate text-lg font-medium text-neutral-900"
            data-testid="profile_name_text"
          >
            {user.fullName}
          </div>
          <div className="truncate text-sm text-neutral-500" data-testid="profile_role_text">
            {ROLE_LABELS[user.role]} · {user.email}
          </div>
          {user.phone && <div className="font-mono text-sm text-neutral-500">{user.phone}</div>}
        </div>
      </section>

      <Group title="Доступ">
        <Row
          to="/profile/password"
          icon="🔒"
          label="Сменить пароль"
          testId="profile_change_password_tile"
        />
      </Group>

      <Group title="Геолокация">
        <div className="px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-neutral-700">📍 Местоположение</span>
            <span
              className={[
                'text-right text-xs',
                geo === 'denied' ? 'text-danger-600' : 'text-neutral-500',
              ].join(' ')}
              data-testid="profile_gps_status_text"
            >
              {GEO_TEXT[geo]}
            </span>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Для отметки на смене и SOS браузеру нужен доступ к геолокации. В браузере позиция
            определяется только пока страница открыта.
          </p>
        </div>
      </Group>

      <Group title="Уведомления и данные">
        <RowButton
          icon="🔔"
          label="Уведомления"
          onClick={() => setNotifOpen(true)}
          testId="profile_notifications_tile"
        />
        <Row
          to="/offline"
          icon="⚡"
          label="Очередь отправки"
          value={
            pending > 0
              ? `${pending} ${plural(pending, 'действие', 'действия', 'действий')}`
              : 'пусто'
          }
          testId="profile_queue_tile"
        />
        {install.canInstall && (
          <RowButton
            icon="📲"
            label="Установить на экран «Домой»"
            onClick={() => void install.prompt()}
            testId="profile_install_tile"
          />
        )}
        {install.iosHint && (
          <div className="px-4 py-3 text-xs text-neutral-500">
            📲 Чтобы открывать как приложение: «Поделиться» → «На экран «Домой»».
          </div>
        )}
        <div
          className="flex items-center justify-between px-4 py-3 text-sm text-neutral-500"
          data-testid="profile_about_tile"
        >
          <span>ⓘ О приложении</span>
          <span className="font-mono text-xs">версия {APP_VERSION}</span>
        </div>
      </Group>

      <Button
        variant="secondary"
        className="min-h-[48px] w-full border border-danger-500 bg-white text-danger-600 hover:bg-neutral-100"
        onClick={() => setConfirmLogout(true)}
        data-testid="profile_logout_button"
      >
        Выйти
      </Button>

      <ConfirmDialog
        open={confirmLogout}
        title="Выйти из аккаунта?"
        text={pending > 0 ? `Неотправленные действия (${pending}) будут потеряны.` : undefined}
        confirmLabel="Выйти"
        danger
        loading={leaving}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => void handleLogout()}
        testId="profile_logout_confirm"
      />

      <NotificationsSheet open={notifOpen} online={online} onClose={() => setNotifOpen(false)} />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-neutral-500">{title}</h2>
      <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white shadow-sm">
        {children}
      </div>
    </section>
  );
}

function Row({
  to,
  icon,
  label,
  value,
  testId,
}: {
  to: string;
  icon: string;
  label: string;
  value?: string;
  testId?: string;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-[48px] items-center gap-3 px-4 py-3 text-sm text-neutral-900 hover:bg-neutral-50"
      data-testid={testId}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="flex-1">{label}</span>
      {value && <span className="text-xs text-neutral-500">{value}</span>}
      <span className="text-neutral-400" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

function RowButton({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-left text-sm text-neutral-900 hover:bg-neutral-50"
      data-testid={testId}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-neutral-400" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function NotificationsSheet({
  open,
  online,
  onClose,
}: {
  open: boolean;
  online: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);
  const settings = useQuery({
    queryKey: ['notifications', 'settings'],
    queryFn: getNotificationSettings,
    enabled: open,
  });
  const [disabled, setDisabled] = useState<string[]>([]);

  useEffect(() => {
    if (settings.data) setDisabled(settings.data.disabledTypes);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => updateNotificationSettings({ disabledTypes: disabled as NotificationType[] }),
    onSuccess: (data) => {
      queryClient.setQueryData(['notifications', 'settings'], data);
      showToast('Настройки сохранены', 'success');
      onClose();
    },
    onError: (error) =>
      showToast(online ? errorMessage(error) : 'Нет соединения. Настройки не сохранены.', 'error'),
  });

  const types = settings.data?.availableTypes ?? [];

  return (
    <Sheet
      open={open}
      title="Уведомления"
      onClose={onClose}
      testId="profile_notifications_sheet"
      footer={
        <Button
          variant="primary"
          className="min-h-[48px] w-full"
          loading={save.isPending}
          disabled={!settings.data}
          onClick={() => save.mutate()}
          data-testid="profile_notifications_save_button"
        >
          Сохранить
        </Button>
      }
    >
      {settings.isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-neutral-200" />
      ) : settings.isError ? (
        <ErrorBanner error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <div className="flex flex-col divide-y divide-neutral-200">
          {types.map((type) => {
            const enabled = !disabled.includes(type);
            return (
              <label
                key={type}
                className="flex min-h-[48px] items-center justify-between gap-3 py-2 text-sm text-neutral-900"
              >
                <span>{TYPE_LABELS[type] ?? type}</span>
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                  checked={enabled}
                  onChange={(event) =>
                    setDisabled((current) =>
                      event.target.checked ? current.filter((t) => t !== type) : [...current, type],
                    )
                  }
                  data-testid={`profile_notification_switch_${type}`}
                />
              </label>
            );
          })}
          {types.length === 0 && (
            <div className="py-4 text-sm text-neutral-500">Типов уведомлений нет</div>
          )}
        </div>
      )}
    </Sheet>
  );
}
