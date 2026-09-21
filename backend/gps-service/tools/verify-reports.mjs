/**
 * Проверка read-моделей отчётов gps-service на живом стенде (М7.1).
 *
 * ПОЧЕМУ НЕ ТОЛЬКО e2e. Геометрия (ST_Contains, пары «вошёл/вышел», порог посещения)
 * через API не проверяется: `POST /api/gps/track` принимает точки только «сейчас», а
 * сценарий с 10-минутным посещением требует истории. Поэтому скрипт собирает факт прямо
 * в БД (геозона — полигон, треки — точки с известным временем) и сверяет с ним ОТВЕТ API.
 *
 * СЦЕНАРИЙ (одни сутки):
 *   1. вход внутрь геозоны в 09:00, выход наружу в 09:10  → посещение 10 минут;
 *   2. вход в 10:00, выход в 10:02                        → транзит 2 минуты (ниже порога);
 *   3. точка в стороне от геозоны в 11:00                 → в посещения не входит.
 * Ожидаем: посещений 1, появлений в геозоне 2, время на объекте 10 минут, точек трека 3.
 *
 * ФИЛЬТР ПО СЕБЕ. Скрипт работает на живом стенде, где лежат данные других прогонов,
 * поэтому каждый запрос ограничен своим объектом (`E2E_M71_OBJECT_ID`) и своим
 * сотрудником: абсолютные счётчики по всей БД здесь ничего не доказывают.
 *
 * Запуск: cd backend/gps-service && node tools/verify-reports.mjs
 * Требует поднятых auth (:3001) и gps (:3004).
 */
import { PrismaClient } from '@prisma/client';

const GPS_URL = process.env.E2E_GPS_URL ?? 'http://127.0.0.1:3004';
const AUTH_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:3001';
/** Свой объект — чтобы отчёт не смешивался с данными других прогонов на стенде. */
const OBJECT_ID = process.env.E2E_M71_OBJECT_ID ?? '00000000-0000-4000-8000-00000000m71'.replace('m71', '0711');
const MIN_VISIT = 5;

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.GPS_DATABASE_URL } },
});

async function main() {
  // 1. Чистый лист для СВОЕГО объекта (данные других прогонов не трогаем).
  await prisma.$executeRawUnsafe(`DELETE FROM geofences WHERE object_id = $1::uuid`, OBJECT_ID);

  // 2. Оператор-фикстура: его id нужен в `gps_tracks.user_id` (uuid).
  const login = await fetch(`${AUTH_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'operator@cleaning-ops.com', password: 'oper123' }),
  });
  const { accessToken } = await login.json();
  const me = await fetch(`${AUTH_URL}/api/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  }).then((r) => r.json());

  // Треки этого прогона — только в окне сценария: уборка и подсчёт не задевают чужие точки.
  const day = new Date().toISOString().slice(0, 10);
  const at = (hhmm) => new Date(`${day}T${hhmm}:00.000Z`);
  const scenarioFrom = at('00:00');
  const scenarioTo = at('23:59');
  await prisma.$executeRawUnsafe(
    `DELETE FROM gps_tracks WHERE user_id = $1::uuid AND timestamp >= $2 AND timestamp <= $3`,
    me.id,
    scenarioFrom,
    scenarioTo,
  );

  // 3. Геозона — квадрат ~66×66 м вокруг 55.7600/37.6200.
  const lat = 55.76;
  const lng = 37.62;
  const half = 0.0003;
  const boundary = JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [
        [lng - half, lat - half],
        [lng + half, lat - half],
        [lng + half, lat + half],
        [lng - half, lat + half],
        [lng - half, lat - half],
      ],
    ],
  });
  const [geofence] = await prisma.$queryRawUnsafe(
    `INSERT INTO geofences (object_id, name, boundary, radius_meters)
     VALUES ($1::uuid, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)::geometry(Polygon, 4326), 100)
     RETURNING id, name`,
    OBJECT_ID,
    `M7.1 проверка отчёта ${Date.now()}`,
    boundary,
  );

  // 4. Треки сценария.
  const outside = { lat: 55.79, lng: 37.66 };
  const points = [
    { t: at('09:00'), p: { lat, lng } },
    { t: at('09:10'), p: outside },
    { t: at('10:00'), p: { lat, lng } },
    { t: at('10:02'), p: outside },
    { t: at('11:00'), p: { lat: 55.5, lng: 37.4 } },
  ];
  for (const point of points) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO gps_tracks (user_id, location, accuracy, timestamp)
       VALUES ($1::uuid, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geometry(Point, 4326), 5, $4)`,
      me.id,
      point.p.lng,
      point.p.lat,
      point.t,
    );
  }

  // 5. Ответ API по read-моделям (фильтр — свой объект и свой сотрудник).
  const query = `objectId=${OBJECT_ID}&userId=${me.id}&from=${day}&to=${day}`;
  const response = await fetch(`${GPS_URL}/api/gps/reports/geofence-control?${query}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const report = await response.json();
  const summary = await fetch(`${GPS_URL}/api/gps/reports/summary`, {
    headers: { authorization: `Bearer ${accessToken}` },
  }).then((r) => r.json());

  // 6. Факт из сырых таблиц — независимо от представлений.
  const [fact] = await prisma.$queryRawUnsafe(
    `SELECT
       (SELECT COUNT(*)::int FROM gps_tracks t
          JOIN geofences g ON ST_Contains(g.boundary, t.location)
         WHERE g.object_id = $1::uuid AND t.user_id = $2::uuid) AS points_inside,
       (SELECT COUNT(*)::int FROM gps_tracks t
          JOIN geofences g ON ST_DWithin(g.boundary::geography, t.location::geography, 2000)
         WHERE g.object_id = $1::uuid AND t.user_id = $2::uuid
           AND t.timestamp >= $3 AND t.timestamp <= $4) AS points_in_scope,
       (SELECT COUNT(*)::int FROM gps_tracks t
         WHERE t.user_id = $2::uuid AND t.timestamp >= $5 AND t.timestamp <= $6) AS points_total_today`,
    OBJECT_ID,
    me.id,
    at('09:00'),
    at('11:00'),
    scenarioFrom,
    scenarioTo,
  );

  console.log('геозона:', geofence.name, geofence.id);
  console.log('объект:', OBJECT_ID, '| оператор:', me.id);
  console.log('ФАКТ (сырые таблицы): точек сценария в радиусе геозоны', fact.points_in_scope, '| внутри геозоны', fact.points_inside, '| всего за сутки', fact.points_total_today);
  console.log('ОТВЕТ API geofence-control:', JSON.stringify({ rows: report.rows, series: report.series, totals: report.totals }));
  console.log('ОТВЕТ API summary:', JSON.stringify(summary));

  const checks = [
    ['в радиусе геозоны 2 точки сценария (входы)', fact.points_in_scope === 2],
    ['внутри геозоны 2 точки сценария', fact.points_inside === 2],
    ['строка отчёта одна (сотрудник + объект)', report.rows?.length === 1],
    [`посещений (>= ${MIN_VISIT} мин) ровно одно — транзит 2 мин отсечён`, report.rows?.[0]?.visitsCount === 1],
    ['появлений в геозоне два (посещение + транзит)', report.rows?.[0]?.presenceCount === 2],
    ['время на объекте 12 минут (10 + транзит 2)', report.rows?.[0]?.dwellMinutes === 12],
    ['итоги совпадают со строкой', report.totals?.visitsCount === 1 && report.totals?.dwellMinutes === 12],
    ['ряд по дням содержит день сценария', report.series?.length === 1 && report.series[0].day === day],
    ['активность по маршруту сужается фильтром сотрудника', report.routes?.[0]?.day === day],
  ];

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? 'OK  ' : 'ФЕЙЛ'} ${name}`);
    if (!ok) failed += 1;
  }

  // 7. Уборка: следы проверки не остаются на стенде.
  await prisma.$executeRawUnsafe(
    `DELETE FROM gps_tracks WHERE user_id = $1::uuid AND timestamp >= $2 AND timestamp <= $3`,
    me.id,
    scenarioFrom,
    scenarioTo,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM geofences WHERE id = $1::uuid`, geofence.id);
  console.log('уборка выполнена');

  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
