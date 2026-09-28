/**
 * Пути маршрутов одним модулем: их используют и роутер, и страницы для ссылок
 * и навигации после сохранения. Литералы, разбросанные по страницам, расходятся
 * при первом же переименовании.
 */
export const ROUTES = {
  dashboard: '/dashboard',
  login: '/login',

  objects: '/objects',
  object: (id: string) => `/objects/${id}`,

  floors: (objectId: string) => `/objects/${objectId}/floors`,
  floorPlan: (objectId: string, floorId: string) => `/objects/${objectId}/floors/${floorId}`,

  routes: '/routes',
  route: (id: string) => `/routes/${id}`,

  techCards: '/tech-cards',
  techCard: (id: string) => `/tech-cards/${id}`,

  templates: '/templates',

  tickets: '/tickets',
  ticket: (id: string) => `/tickets/${id}`,

  map: '/map',

  notifications: '/notifications',

  employees: '/employees',
  materials: '/materials',
  schedule: '/schedule',
  messages: '/messages',
  reports: '/reports',
} as const;
