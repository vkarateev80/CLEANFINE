import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listFloors, listObjects } from '../../api/core';
import { COLOR_ZONE_META } from '@cleaning-ops/shared/types/color-coding';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Card';
import { ColorZoneBadge } from '../../components/ui/ColorZone';
import { ErrorBanner } from '../../components/ui/Feedback';
import { Field, Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ROUTES } from '../../router/routes';
import {
  TEMPLATE_CATEGORIES,
  templateSummary,
  templatesByCategory,
  type LibraryTemplate,
  type TemplateCategoryId,
} from '../../templates/library';
import {
  createMaterialSetFromTemplate,
  createObjectFromTemplate,
  createRouteFromTemplate,
  createTechCardFromTemplate,
} from '../../templates/instantiate';

/**
 * Раздел «Шаблоны» (`/templates`, RoleGuard ADMIN/SUPERVISOR).
 *
 * Библиотека демо-заготовок по всем категориям: техкарты, маршруты, объекты.
 * Карточка показывает сводку и открывает просмотр, «Создать из шаблона»
 * разворачивает заготовку в реальную сущность штатными POST-вызовами
 * (`templates/instantiate.ts`) и ведёт на неё. Хранение — статический словарь
 * в `templates/library.ts`: шаблон не объект БД, а каталожная запись в коде.
 */

type CategoryFilter = TemplateCategoryId | 'all';

function summaryChips(template: LibraryTemplate): string[] {
  return templateSummary(template);
}

/** Публичный файл из `public/` с учётом базы сайта (`/` или `/client/`). */
function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path}`;
}

export function TemplatesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [preview, setPreview] = useState<LibraryTemplate | null>(null);
  const [createTarget, setCreateTarget] = useState<LibraryTemplate | null>(null);

  const [nameDraft, setNameDraft] = useState('');
  const [clientNameDraft, setClientNameDraft] = useState('');
  const [clientContactDraft, setClientContactDraft] = useState('');
  const [routeObjectId, setRouteObjectId] = useState('');
  const [routeFloorId, setRouteFloorId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const templates = useMemo(() => templatesByCategory(filter), [filter]);

  const isRouteCreate = createTarget?.category === 'routes';
  const objectsQuery = useQuery({
    queryKey: ['templates', 'objects'],
    queryFn: () => listObjects({ take: 100 }),
    enabled: isRouteCreate,
  });
  const floorsQuery = useQuery({
    queryKey: ['templates', 'floors', routeObjectId],
    queryFn: () => listFloors(routeObjectId),
    enabled: isRouteCreate && routeObjectId !== '',
  });

  function openPreview(template: LibraryTemplate) {
    setError(null);
    setPreview(template);
  }

  function openCreate(template: LibraryTemplate) {
    // Табличка — печатный материал, в системе ничего не создаёт.
    if (template.category === 'color-coding') return;
    setError(null);
    setPreview(null);
    setNameDraft(template.name);
    setClientNameDraft(template.category === 'objects' ? template.clientDefaults.clientName : '');
    setClientContactDraft(
      template.category === 'objects' ? template.clientDefaults.clientContact : '',
    );
    setRouteObjectId('');
    setRouteFloorId('');
    setCreateTarget(template);
  }

  async function handleCreate() {
    if (!createTarget) return;
    const name = nameDraft.trim();
    // Набор материалов — не одна сущность: имя шаблона ей не нужно.
    if (createTarget.category !== 'materials' && !name) {
      setError(new Error('Укажите название'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      switch (createTarget.category) {
        case 'tech-cards': {
          const id = await createTechCardFromTemplate(createTarget, name);
          setCreateTarget(null);
          navigate(ROUTES.techCard(id));
          break;
        }
        case 'objects': {
          const id = await createObjectFromTemplate(
            createTarget,
            name,
            clientNameDraft.trim(),
            clientContactDraft.trim(),
          );
          setCreateTarget(null);
          await queryClient.invalidateQueries({ queryKey: ['objects'] });
          navigate(ROUTES.object(id));
          break;
        }
        case 'materials': {
          await createMaterialSetFromTemplate(createTarget);
          setCreateTarget(null);
          await queryClient.invalidateQueries({ queryKey: ['materials'] });
          navigate(ROUTES.materials);
          break;
        }
        case 'routes': {
          if (!routeFloorId) {
            setError(new Error('Выберите объект и этаж'));
            break;
          }
          const id = await createRouteFromTemplate(createTarget, routeFloorId, name);
          setCreateTarget(null);
          await queryClient.invalidateQueries({ queryKey: ['routes'] });
          navigate(ROUTES.route(id));
          break;
        }
        case 'color-coding':
          // Недостижимо: openCreate не открывает диалог для табличек.
          setCreateTarget(null);
          break;
      }
      await queryClient.invalidateQueries({ queryKey: ['tech-cards'] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="templates-page">
      <PageHeader
        title="Шаблоны"
        subtitle="Готовые заготовки техкарт, маршрутов, объектов и материалов: просмотрите состав и создайте реальную сущность в один клик. Таблички цветовой кодировки — для печати на посты уборки."
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Категории шаблонов">
        <Button
          size="sm"
          variant={filter === 'all' ? 'primary' : 'secondary'}
          aria-pressed={filter === 'all'}
          data-testid="template-category-all"
          onClick={() => setFilter('all')}
        >
          Все
        </Button>
        {TEMPLATE_CATEGORIES.map((category) => (
          <Button
            key={category.id}
            size="sm"
            variant={filter === category.id ? 'primary' : 'secondary'}
            aria-pressed={filter === category.id}
            data-testid={`template-category-${category.id}`}
            onClick={() => setFilter(category.id)}
          >
            {category.icon} {category.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const categoryMeta = TEMPLATE_CATEGORIES.find((c) => c.id === template.category);
          return (
            <Card
              key={template.id}
              testId={`template-card-${template.id}`}
              className="flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-neutral-400">
                    {categoryMeta?.icon} {categoryMeta?.label}
                  </div>
                  <div className="break-words text-base font-semibold text-neutral-900">
                    {template.name}
                  </div>
                </div>
              </div>
              <p className="break-words text-sm text-neutral-500">{template.description}</p>
              {template.category === 'color-coding' && (
                <button
                  type="button"
                  className="overflow-hidden rounded-lg border border-neutral-200"
                  aria-label={`Открыть табличку «${template.name}»`}
                  onClick={() => openPreview(template)}
                >
                  <img
                    src={publicUrl(template.image)}
                    alt={template.name}
                    loading="lazy"
                    className="block aspect-square w-full object-cover"
                  />
                </button>
              )}
              <div className="flex flex-wrap gap-2">
                {template.category === 'color-coding' && <ColorZoneBadge zone={template.zone} />}
                {summaryChips(template).map((chip) => {
                  // У таблички инвентарь («Швабра, Ведро…») — шрифтом своего цвета.
                  const tools =
                    template.category === 'color-coding' &&
                    chip === COLOR_ZONE_META[template.zone].tools.join(', ')
                      ? COLOR_ZONE_META[template.zone]
                      : null;
                  return (
                    <span
                      key={chip}
                      className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs text-neutral-600"
                      style={
                        tools === null
                          ? undefined
                          : {
                              color: tools.hexDark,
                              borderColor: tools.hex,
                              backgroundColor: tools.hexSoft,
                              fontWeight: 500,
                            }
                      }
                    >
                      {chip}
                    </span>
                  );
                })}
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid={`template-preview-${template.id}`}
                  onClick={() => openPreview(template)}
                >
                  Просмотр
                </Button>
                {template.category === 'color-coding' ? (
                  <a
                    href={publicUrl(template.pdf)}
                    download
                    data-testid={`template-download-${template.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700"
                  >
                    Скачать PDF
                  </a>
                ) : (
                  <Button
                    size="sm"
                    data-testid={`template-create-${template.id}`}
                    onClick={() => openCreate(template)}
                  >
                    Создать из шаблона
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ----------------------------------------------------------- просмотр */}
      <Modal
        open={preview !== null}
        title={preview?.name ?? ''}
        onClose={() => setPreview(null)}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Закрыть
            </Button>
            {preview && preview.category === 'color-coding' && (
              <a
                href={publicUrl(preview.pdf)}
                download
                data-testid="template-preview-download"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
              >
                Скачать PDF
              </a>
            )}
            {preview && preview.category !== 'color-coding' && (
              <Button data-testid="template-preview-create" onClick={() => openCreate(preview)}>
                Создать из шаблона
              </Button>
            )}
          </>
        }
      >
        {preview && <TemplatePreviewBody template={preview} />}
      </Modal>

      {/* --------------------------------------------------------- создание */}
      <Modal
        open={createTarget !== null}
        title={`Создать из шаблона «${createTarget?.name ?? ''}»`}
        onClose={() => (busy ? undefined : setCreateTarget(null))}
        busy={busy}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setCreateTarget(null)}>
              Отмена
            </Button>
            <Button loading={busy} data-testid="template-create-submit" onClick={handleCreate}>
              Создать
            </Button>
          </>
        }
      >
        {createTarget && (
          <div className="flex flex-col gap-4">
            {createTarget.category !== 'materials' && (
              <Field label="Название" htmlFor="template-name" required>
                <Input
                  id="template-name"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
              </Field>
            )}

            {createTarget.category === 'materials' && (
              <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <div className="font-medium text-neutral-800">
                  Будет создано позиций: {createTarget.items.length}
                </div>
                <ul className="flex flex-col gap-1 text-neutral-600">
                  {createTarget.items.map((item) => (
                    <li key={item.name} className="flex justify-between gap-3">
                      <span>{item.name}</span>
                      <span className="shrink-0 text-neutral-400">
                        {item.defaultConsumption} {item.unit}/оп. · {item.costPerUnit} ₽
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {createTarget.category === 'objects' && (
              <>
                <Field label="Клиент" htmlFor="template-client" required>
                  <Input
                    id="template-client"
                    value={clientNameDraft}
                    onChange={(event) => setClientNameDraft(event.target.value)}
                  />
                </Field>
                <Field label="Контакт клиента" htmlFor="template-contact" required>
                  <Input
                    id="template-contact"
                    value={clientContactDraft}
                    onChange={(event) => setClientContactDraft(event.target.value)}
                  />
                </Field>
              </>
            )}

            {createTarget.category === 'routes' && (
              <>
                <Field label="Объект" htmlFor="template-object" required>
                  <Select
                    id="template-object"
                    value={routeObjectId}
                    onChange={(event) => {
                      setRouteObjectId(event.target.value);
                      setRouteFloorId('');
                    }}
                  >
                    <option value="">— выберите объект —</option>
                    {(objectsQuery.data?.items ?? []).map((object) => (
                      <option key={object.id} value={object.id}>
                        {object.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Этаж"
                  htmlFor="template-floor"
                  required
                  hint="Точки шаблона привяжутся к помещениям этажа в порядке их списка."
                >
                  <Select
                    id="template-floor"
                    value={routeFloorId}
                    disabled={routeObjectId === ''}
                    onChange={(event) => setRouteFloorId(event.target.value)}
                  >
                    <option value="">— выберите этаж —</option>
                    {(floorsQuery.data ?? []).map((floor) => (
                      <option key={floor.id} value={floor.id}>
                        {floor.number}. {floor.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}

            {error !== null && <ErrorBanner error={error} />}
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Тело диалога просмотра: состав шаблона по категориям. */
function TemplatePreviewBody({ template }: { template: LibraryTemplate }) {
  if (template.category === 'color-coding') {
    const meta = COLOR_ZONE_META[template.zone];
    return (
      <div className="flex flex-col gap-3" data-testid="template-preview-body">
        <p className="break-words text-sm text-neutral-500">{template.description}</p>
        <img
          src={publicUrl(template.image)}
          alt={template.name}
          className="block w-full rounded-lg border border-neutral-200"
        />
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
            <dt className="text-xs text-neutral-400">Зона</dt>
            <dd className="text-neutral-800">
              {meta.zoneName} ({meta.where})
            </dd>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
            <dt className="text-xs text-neutral-400">Инвентарь</dt>
            <dd className="font-medium" style={{ color: meta.hexDark }}>
              {meta.tools.join(', ')}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-neutral-400">
          Цвет помещения на плане и в приложении оператора определяется автоматически по типу
          помещения; поле «Зона» («{meta.adjective} зона») задаёт его явно.
        </p>
      </div>
    );
  }

  if (template.category === 'tech-cards') {
    return (
      <div className="flex flex-col gap-3" data-testid="template-preview-body">
        <p className="break-words text-sm text-neutral-500">{template.description}</p>
        <ol className="flex flex-col gap-2">
          {template.operations.map((operation, index) => (
            <li
              key={operation.name}
              className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            >
              <span className="text-neutral-800">
                {index + 1}. {operation.name}
                {operation.requiresPhoto && (
                  <span className="ml-2 text-xs text-neutral-400">· фото</span>
                )}
                {operation.requiresQr && (
                  <span className="ml-2 text-xs text-neutral-400">· QR</span>
                )}
              </span>
              <span className="shrink-0 text-neutral-500">{operation.estimatedTimeMin} мин</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (template.category === 'routes') {
    return (
      <div className="flex flex-col gap-3" data-testid="template-preview-body">
        <p className="break-words text-sm text-neutral-500">{template.description}</p>
        <p className="text-xs text-neutral-400">
          При создании точки привязываются к помещениям выбранного этажа по порядку: первая точка —
          к первому помещению.
        </p>
        <ol className="flex flex-col gap-2">
          {template.points.map((point, index) => (
            <li
              key={point.label}
              className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            >
              <span className="text-neutral-800">
                {index + 1}. {point.label}
              </span>
              <span className="shrink-0 text-neutral-500">{point.estimatedTimeMin} мин</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (template.category === 'materials') {
    return (
      <div className="flex flex-col gap-3" data-testid="template-preview-body">
        <p className="break-words text-sm text-neutral-500">{template.description}</p>
        <ul className="flex flex-col gap-2">
          {template.items.map((item) => (
            <li
              key={item.name}
              className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            >
              <span className="text-neutral-800">
                {item.name}
                <span className="ml-2 text-xs text-neutral-400">
                  норма {item.defaultConsumption} {item.unit} · порог {item.minStockThreshold}
                </span>
              </span>
              <span className="shrink-0 text-neutral-500">
                {item.costPerUnit} ₽/{item.unit}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="template-preview-body">
      <p className="break-words text-sm text-neutral-500">{template.description}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
          <dt className="text-xs text-neutral-400">Тип</dt>
          <dd className="text-neutral-800">{template.preset.type}</dd>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
          <dt className="text-xs text-neutral-400">Площадь</dt>
          <dd className="text-neutral-800">{template.preset.totalArea} м²</dd>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
          <dt className="text-xs text-neutral-400">Этажей</dt>
          <dd className="text-neutral-800">{template.preset.floorsCount}</dd>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
          <dt className="text-xs text-neutral-400">Координаты</dt>
          <dd className="text-neutral-800">
            {template.preset.lat}, {template.preset.lng}
          </dd>
        </div>
      </dl>
      <div className="text-sm text-neutral-600">Адрес: {template.preset.address}</div>
    </div>
  );
}
