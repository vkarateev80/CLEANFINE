import { createContext, useContext, type ReactNode } from 'react';
import type { ObjectScope } from '../../hooks/useObjectScope';

/**
 * Объект клиента, определённый один раз на весь каркас портала.
 *
 * Определение привязки — дорогое (запрос списка объектов) и общее для всех
 * экранов, поэтому оно живёт в `ClientLayout`, а страницы читают готовый
 * результат. Вторая копия запроса на каждой странице дала бы расхождение: одна
 * страница успела бы получить объект, другая ещё нет, и header «мигал» бы
 * названием объекта.
 */
const ObjectScopeContext = createContext<ObjectScope | null>(null);

export function ObjectScopeProvider({
  scope,
  children,
}: {
  scope: ObjectScope;
  children: ReactNode;
}) {
  return <ObjectScopeContext.Provider value={scope}>{children}</ObjectScopeContext.Provider>;
}

/**
 * Scope текущего экрана. Бросает, если провайдера нет: это ошибка разработчика
 * (страница забыта внутри `ClientLayout`), и молчаливый `null` превратился бы в
 * «объект не подключён» у всех пользователей сразу.
 */
export function useObjectScopeContext(): ObjectScope {
  const scope = useContext(ObjectScopeContext);
  if (!scope) {
    throw new Error('useObjectScopeContext: компонент вне ClientLayout/ObjectScopeProvider');
  }
  return scope;
}

/** Объект в состоянии `ready` — то, что нужно почти всем экранам. */
export function useCurrentObject() {
  const scope = useObjectScopeContext();
  return scope.object;
}
