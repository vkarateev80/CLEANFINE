import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Кнопки действий внизу; если не переданы — модалка только с содержимым. */
  footer?: ReactNode;
  /** `lg` — для форм с несколькими колонками (объект, операция). */
  size?: 'md' | 'lg';
  /** Пока идёт запрос, закрытие по Esc/оверлею блокируется. */
  busy?: boolean;
  /**
   * На телефоне (<768 px) панель всегда занимает экран целиком, поэтому `position`
   * влияет только на планшет/desktop: `center` — прежний центрированный вид,
   * `bottom` — короткая панель снизу (bottom sheet для `ConfirmDialog`).
   */
  position?: 'center' | 'bottom';
}

const SIZES = { md: 'max-w-lg', lg: 'max-w-3xl' } as const;

/**
 * Оверлей. `max-md:p-0` обязателен для обоих вариантов: на телефоне панель
 * занимает весь экран (`center`) или всю ширину снизу (`bottom`), а отступ в 24 px
 * от краёв экрана оставил бы рамку затемнения и сузил панель.
 * `max-md:items-stretch` — только для `center`: на телефоне панель тянется на всю
 * высоту; у bottom-sheet выравнивание к низу (`items-end`) сохраняется.
 */
const OVERLAY = 'fixed inset-0 z-50 flex overflow-y-auto bg-neutral-900/60 p-6 max-md:p-0';

const OVERLAY_POSITION: Record<NonNullable<ModalProps['position']>, string> = {
  center: 'items-start justify-center max-md:items-stretch',
  bottom: 'items-end justify-center',
};

/** Общий класс панели: ниже `md` — fullscreen, выше — как было до адаптива. */
const PANEL =
  'w-full rounded-xl bg-white p-6 shadow-xl ' +
  'max-md:mt-0 max-md:flex max-md:h-dvh max-md:max-w-none max-md:flex-col max-md:rounded-none max-md:p-0';

const PANEL_POSITION: Record<NonNullable<ModalProps['position']>, string> = {
  center: 'mt-12',
  bottom: 'max-md:rounded-b-none max-md:rounded-t-2xl max-md:p-4',
};

/**
 * Блокировка скролла фона, пока открыто любое модальное окно.
 *
 * Счётчик, а не флаг: в проекте бывают вложенные окна (модалка поверх модалки,
 * `ConfirmDialog` поверх формы). Каждое окно сохраняет значение `overflow`, что
 * было ДО него, и восстанавливает при закрытии/размонтировании; счётчик нужен,
 * чтобы закрытие нижнего окна не разблокировало фон под открытым верхним.
 */
let lockCount = 0;

function lockScroll(): () => void {
  const previousOverflow = document.body.style.overflow;
  lockCount += 1;
  document.body.style.overflow = 'hidden';

  return () => {
    lockCount -= 1;
    if (lockCount === 0) document.body.style.overflow = previousOverflow;
  };
}

/**
 * Модальное окно по DS-003: затемнение `bg-neutral-900/60`, панель `rounded-xl
 * bg-white shadow-xl`. Закрывается по Esc и клику по оверлею — но не во время
 * запроса: иначе пользователь закроет форму, не увидев ошибки сохранения.
 *
 * Адаптив: на телефоне (<768 px) — fullscreen с прокручиваемым телом и
 * закреплённым футером, чтобы кнопки сохранения были достижимы без прокрутки
 * страницы. На планшете и desktop вид не меняется (все правки scoped `max-md:`).
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  busy,
  position = 'center',
}: ModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy]);

  useEffect(() => {
    if (!open) return undefined;
    return lockScroll();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={[OVERLAY, OVERLAY_POSITION[position]].join(' ')}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[PANEL, PANEL_POSITION[position], SIZES[size]].join(' ')}
      >
        {/* Шапка, тело и футер — раздельные блоки: на телефоне шапка и футер стоят
            неподвижно (футер sticky), а прокручивается только тело. */}
        <div className="mb-4 flex items-start justify-between gap-4 max-md:mb-0 max-md:shrink-0 max-md:border-b max-md:border-neutral-200 max-md:px-4 max-md:py-3">
          <h2 className="text-lg font-medium text-neutral-900">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="max-md:-mr-2 max-lg:min-h-[44px] max-lg:min-w-[44px]"
          >
            ✕
          </Button>
        </div>
        <div className="max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:p-4">
          {children}
        </div>
        {footer && (
          // `[&>*]:w-full` и `[&>*]:min-h-[44px]` только на телефоне: кнопки
          // становятся строками на всю ширину с тач-высотой — самый крупный таргет
          // для большого пальца. На ≥768 правила не действуют, футер остаётся
          // прежним рядом кнопок справа.
          <div className="mt-6 flex justify-end gap-3 max-md:sticky max-md:bottom-0 max-md:mt-0 max-md:shrink-0 max-md:flex-col max-md:border-t max-md:border-neutral-200 max-md:bg-white max-md:p-4 max-md:[&>*]:min-h-[44px] max-md:[&>*]:w-full">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` — для удаления: красная кнопка подтверждения. */
  variant?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Диалог подтверждения — общий для всех удалений и необратимых действий.
 * Переиспользует `Modal` с `position="bottom"`: на телефоне это короткая панель
 * снизу (ближе к большому пальцу), на планшете/desktop — прежний центрированный вид.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  variant = 'danger',
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      busy={busy}
      position="bottom"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-neutral-600">{message}</div>
    </Modal>
  );
}
