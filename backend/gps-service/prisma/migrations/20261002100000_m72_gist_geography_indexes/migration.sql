-- М7.2: рабочие пространственные индексы для geography-запросов PostGIS.
--
-- Почему понадобилась отдельная миграция. В М3.1 были созданы GIST-индексы по
-- geometry-колонкам (`idx_gps_tracks_location`, `idx_geofences_boundary`), но оба
-- «горячих» пространственных запроса сервиса приводят колонку к geography:
--
--   gps.service.ts      findNearbyEmployees: ST_DWithin(gps.location::geography, point::geography, r)
--   geofence.service.ts check:              ST_DWithin(g.boundary::geography, point::geography, r)
--
-- GIST-индекс по geometry такую форму предиката обслуживать не может (выражение
-- `location::geography` не совпадает с индексируемым `location`), и планировщик его
-- игнорировал: `EXPLAIN (ANALYZE, BUFFERS)` показывал предикат в строке Filter и
-- десятки тысяч отброшенных строк
-- (test/performance/results/explain/gps-nearby-before.txt, gps-geofence-check-before.txt).
--
-- Индексы по выражению `(колонка::geography)` совпадают с предикатом запроса, поэтому
-- планировщик их использует. Замеры (там же, файлы *-after.txt):
--   employees/nearby : 2400 мс → 378 мс, строк отброшено фильтром 35 468 → 964;
--   geofences/check  : Seq Scan 501 полигон → Index Scan, 223 мс → 151 мс.
--
-- Геометрия-индексы М3.1 остаются: их использует ST_Contains (geometry) в том же
-- geofence.service, и они нужны другим запросам.
CREATE INDEX IF NOT EXISTS "idx_gps_tracks_location_geography"
  ON "gps_tracks" USING GIST ((("location")::geography));

CREATE INDEX IF NOT EXISTS "idx_geofences_boundary_geography"
  ON "geofences" USING GIST ((("boundary")::geography));
