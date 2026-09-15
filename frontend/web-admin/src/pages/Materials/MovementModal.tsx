import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMovement } from '../../api/materials';
import {
  Button,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  SoftWarning,
} from '../../components/ui';
import { errorMessage } from '../../components/ui/Feedback';
import {
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABELS,
  type CreateMovementPayload,
  type CreateMovementResult,
  type MovementType,
} from '../../types/materials';
import { apiStatus, formatQuantity, parseRequiredNumber, shortId } from './materialsHelpers';
import { useMaterialsList, useObjectOptions, useStocks } from './useMaterials';

/**
 * Модалка движения материала (М4.3): приход, расход, перемещение, списание.
 *
 * Контракт `POST /api/materials/movements`:
 *  • `IN`/`TRANSFER` увеличивают остаток, `OUT`/`WRITE_OFF` уменьшают;
 *  • попытка уйти в минус → **400** с текстом «Недостаточно материала…» — этот
 *    текст показывается пользователю как есть, без падения экрана;
 *  • `TRANSFER` требует `targetObjectId` ≠ `objectId`.
 *
 * Остаток по выбранной паре (материал, объект) известен из `GET /stocks`, и при
 * расходе больше остатка форма показывает предупреждение, но НЕ блокирует
 * отправку: окончательное решение за бэкендом (условный UPDATE отклоняет и
 * гонки), а подмена серверной проверки на клиентскую скрыла бы эту ошибку.
 */

export interface MovementPreset {
  materialId?: string;
  objectId?: string;
  type?: MovementType;
}

interface FormState {
  type: MovementType;
  materialId: string;
  objectId: string;
  quantity: string;
  targetObjectId: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

/** Типы, которые списывают остаток: для них проверяем достаточность. */
const CONSUMING: readonly MovementType[] = ['OUT', 'WRITE_OFF'];

export function MovementModal({
  open,
  preset,
  onClose,
  onDone,
}: {
  open: boolean;
  /** Предзаполнение из строки таблицы (материал/объект/тип). */
  preset?: MovementPreset;
  onClose: () => void;
  onDone: (result: CreateMovementResult, materialName: string, unit: string) => void;
}) {
  const queryClient = useQueryClient();
  const objects = useObjectOptions();
  const materials = useMaterialsList({ skip: 0, take: 100 });

  const [values, setValues] = useState<FormState>(() => ({
    type: preset?.type ?? 'IN',
    materialId: preset?.materialId ?? '',
    objectId: preset?.objectId ?? '',
    quantity: '',
    targetObjectId: '',
  }));
  const [errors, setErrors] = useState<Errors>({});

  // Остаток по выбранному объекту: и подсказка «сколько сейчас», и ориентир для
  // предупреждения о нехватке. Запрос идёт и без выбора объекта (все остатки) —
  // так ключ кэша совпадает с вкладкой «Остатки» и данные переиспользуются.
  const stocks = useStocks(values.objectId === '' ? {} : { objectId: values.objectId });

  const save = useMutation({
    mutationFn: (payload: CreateMovementPayload) => createMovement(payload),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['materials'] });
      const material = materials.data?.items.find((item) => item.id === values.materialId);
      onDone(result, material?.name ?? shortId(values.materialId), material?.unit ?? '');
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    save.reset();
  }

  const currentStock = useMemo(() => {
    if (values.materialId === '' || values.objectId === '') return null;
    const found = (stocks.data?.items ?? []).find(
      (stock) => stock.materialId === values.materialId && stock.objectId === values.objectId,
    );
    return found ?? null;
  }, [stocks.data, values.materialId, values.objectId]);

  const quantity = parseRequiredNumber(values.quantity);
  const insufficient =
    currentStock !== null &&
    CONSUMING.includes(values.type) &&
    Number.isFinite(quantity) &&
    quantity > currentStock.quantity;

  function handleSubmit() {
    const next: Errors = {};
    if (values.materialId === '') next.materialId = 'Выберите материал';
    if (values.objectId === '') next.objectId = 'Выберите объект';

    const parsed = parseRequiredNumber(values.quantity);
    if (Number.isNaN(parsed)) next.quantity = 'Количество — число';
    else if (parsed <= 0) next.quantity = 'Количество должно быть больше 0';

    if (values.type === 'TRANSFER') {
      if (values.targetObjectId === '') next.targetObjectId = 'Укажите объект-получатель';
      else if (values.targetObjectId === values.objectId) {
        next.targetObjectId = 'Объект-получатель должен отличаться от объекта-источника';
      }
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    save.mutate({
      materialId: values.materialId,
      objectId: values.objectId,
      type: values.type,
      quantity: parsed,
      // `targetObjectId` отправляем только для TRANSFER: для остальных типов
      // бэкенд отвечает 400 «targetObjectId допустим только для TRANSFER».
      ...(values.type === 'TRANSFER' ? { targetObjectId: values.targetObjectId } : {}),
    });
  }

  function handleClose() {
    setValues({
      type: preset?.type ?? 'IN',
      materialId: preset?.materialId ?? '',
      objectId: preset?.objectId ?? '',
      quantity: '',
      targetObjectId: '',
    });
    setErrors({});
    save.reset();
    onClose();
  }

  const failure = save.isError ? save.error : null;
  const forbidden = apiStatus(failure) === 403;

  function objectLabel(id: string): string {
    return (objects.data?.items ?? []).find((object) => object.id === id)?.name ?? shortId(id);
  }

  return (
    <Modal
      open={open}
      title="Движение материала"
      size="lg"
      busy={save.isPending}
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={save.isPending}>
            Отмена
          </Button>
          <Button
            variant="primary"
            data-testid="movement-submit"
            loading={save.isPending}
            onClick={handleSubmit}
          >
            Провести
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="movement-form">
        {failure ? (
          <ErrorBanner
            error={
              forbidden
                ? new Error('Недостаточно прав: движение материалов доступно ADMIN, SUPERVISOR и OPERATOR')
                : failure
            }
          />
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Тип движения" htmlFor="movement-type" required>
            <Select
              id="movement-type"
              data-testid="movement-type"
              value={values.type}
              onChange={(event) => update('type', event.target.value as MovementType)}
            >
              {MOVEMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MOVEMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Количество" htmlFor="movement-quantity" required error={errors.quantity}>
            <Input
              id="movement-quantity"
              data-testid="movement-quantity"
              className="font-mono"
              inputMode="decimal"
              value={values.quantity}
              invalid={Boolean(errors.quantity)}
              placeholder="100"
              onChange={(event) => update('quantity', event.target.value)}
            />
          </Field>

          <Field label="Материал" htmlFor="movement-material" required error={errors.materialId}>
            <Select
              id="movement-material"
              data-testid="movement-material"
              value={values.materialId}
              invalid={Boolean(errors.materialId)}
              disabled={materials.isLoading}
              onChange={(event) => update('materialId', event.target.value)}
            >
              <option value="">{materials.isLoading ? 'Загрузка…' : 'Выберите материал'}</option>
              {(materials.data?.items ?? []).map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name} ({material.unit})
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={values.type === 'TRANSFER' ? 'Объект-источник' : 'Объект'}
            htmlFor="movement-object"
            required
            error={errors.objectId}
          >
            <Select
              id="movement-object"
              data-testid="movement-object"
              value={values.objectId}
              invalid={Boolean(errors.objectId)}
              disabled={objects.isLoading}
              onChange={(event) => update('objectId', event.target.value)}
            >
              <option value="">{objects.isLoading ? 'Загрузка…' : 'Выберите объект'}</option>
              {(objects.data?.items ?? []).map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name}
                </option>
              ))}
            </Select>
          </Field>

          {values.type === 'TRANSFER' && (
            <Field
              label="Объект-получатель"
              htmlFor="movement-target-object"
              required
              error={errors.targetObjectId}
              hint="Материал спишется с объекта-источника и зачислится получателю"
            >
              <Select
                id="movement-target-object"
                data-testid="movement-target-object"
                value={values.targetObjectId}
                invalid={Boolean(errors.targetObjectId)}
                disabled={objects.isLoading}
                onChange={(event) => update('targetObjectId', event.target.value)}
              >
                <option value="">Выберите получателя</option>
                {(objects.data?.items ?? [])
                  .filter((object) => object.id !== values.objectId)
                  .map((object) => (
                    <option key={object.id} value={object.id}>
                      {object.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
        </div>

        {values.materialId !== '' && values.objectId !== '' && (
          <div className="rounded-lg bg-neutral-100 px-4 py-3 text-xs text-neutral-600">
            {stocks.isLoading ? (
              <LoadingBlock label="Читаем остаток…" />
            ) : currentStock ? (
              <>
                Остаток на объекте «{objectLabel(values.objectId)}»:{' '}
                <span className="font-mono text-neutral-900">
                  {formatQuantity(currentStock.quantity)}
                </span>{' '}
                {currentStock.material.unit} · порог{' '}
                <span className="font-mono">{formatQuantity(currentStock.minStockThreshold)}</span>
              </>
            ) : (
              <>
                По этой паре «материал — объект» остатка ещё нет: он появится после первого
                движения.
              </>
            )}
          </div>
        )}

        {insufficient && currentStock && (
          <SoftWarning>
            На объекте только {formatQuantity(currentStock.quantity)} {currentStock.material.unit}:
            расход больше остатка, сервис ответит ошибкой «Недостаточно материала». Уменьшите
            количество или сначала оформите приход.
          </SoftWarning>
        )}

        {save.isError && (
          <p className="text-xs text-neutral-500" data-testid="movement-error">
            {errorMessage(failure)}
          </p>
        )}
      </div>
    </Modal>
  );
}
