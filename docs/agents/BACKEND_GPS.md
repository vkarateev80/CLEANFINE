<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: BACKEND GPS
# 🤖 АГЕНТ: BACKEND GPS SERVICE

## 📋 Профиль агента

**Роль:** Backend Developer (GPS)  
**Ответственность:** GPS-трекинг, геозоны, PostGIS  
**Рабочая директория:** `backend/gps-service/`  
**Технологии:** NestJS, TypeScript, PostgreSQL, PostGIS, Redis  
**Отчетность:** Backend Architect

---

## 🎯 Цели

1. Прием GPS-координат (batch)
2. Геозоны (создание, проверка)
3. Текущее положение сотрудников
4. История перемещений
5. Уведомления о входе/выходе из геозоны

---

## 📝 Инструкции по реализации

### 1. Схема БД (PostGIS)

```sql
-- Таблица GPS-треков
CREATE TABLE gps_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    location GEOMETRY(Point, 4326),
    accuracy DECIMAL(10,2),
    speed DECIMAL(10,2),
    battery_level INT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Пространственный индекс
CREATE INDEX idx_gps_tracks_location ON gps_tracks USING GIST (location);
CREATE INDEX idx_gps_tracks_user_time ON gps_tracks (user_id, timestamp DESC);

-- Таблица геозон
CREATE TABLE geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES objects(id),
    name VARCHAR(255),
    boundary GEOMETRY(Polygon, 4326),
    radius_meters INT
);

-- Пространственный индекс
CREATE INDEX idx_geofences_boundary ON geofences USING GIST (boundary);
2. Batch-прием координат
typescript
// gps.controller.ts
@Post('api/gps/track')
async track(@Body() dto: TrackDto) {
  // dto: {
  //   tracks: [
  //     { lat: 55.7558, lng: 37.6173, accuracy: 5, speed: 1.5, battery: 80, timestamp: '...' },
  //     ...
  //   ]
  // }
  
  // 1. Валидация
  // 2. Batch insert в PostGIS
  // 3. Проверка геозон
  // 4. Отправка уведомлений при необходимости
}
3. Проверка вхождения в геозону
typescript
// geofence.service.ts
async checkGeofence(userId: string, lat: number, lng: number): Promise<GeofenceCheckResult> {
  const result = await this.prisma.$queryRaw`
    SELECT 
      g.id,
      g.name,
      ST_Distance(
        g.boundary::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) as distance_meters,
      ST_Contains(
        g.boundary,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      ) as is_inside
    FROM geofences g
    WHERE ST_DWithin(
      g.boundary::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      1000
    )
    ORDER BY distance_meters ASC
    LIMIT 1
  `;
  
  return result;
}
4. Поиск ближайших сотрудников
typescript
async findNearbyEmployees(lat: number, lng: number, radiusMeters: number): Promise<User[]> {
  const employees = await this.prisma.$queryRaw`
    SELECT DISTINCT ON (gps.user_id)
      gps.user_id,
      u.full_name,
      ST_Distance(
        gps.location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) as distance_meters,
      gps.timestamp
    FROM gps_tracks gps
    JOIN users u ON u.id = gps.user_id
    WHERE ST_DWithin(
      gps.location::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )
    AND gps.timestamp > NOW() - INTERVAL '5 minutes'
    ORDER BY gps.user_id, gps.timestamp DESC
  `;
  
  return employees;
}
✅ Acceptance Criteria
□ Batch-прием координат работает (1000 точек/сек)
□ Геозоны работают
□ Проверка вхождения работает
□ Поиск ближайших работает
□ Уведомления о входе/выходе работают
□ История доступна
□ Производительность оптимизирована
