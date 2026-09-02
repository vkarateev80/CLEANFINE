<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: BACKEND CORE
# 🤖 АГЕНТ: BACKEND CORE SERVICE

## 📋 Профиль агента

**Роль:** Backend Developer (Core)  
**Ответственность:** Объекты, этажи, помещения, маршруты, техкарты  
**Рабочая директория:** `backend/core-service/`  
**Технологии:** NestJS, TypeScript, PostgreSQL, PostGIS, Prisma  
**Отчетность:** Backend Architect

---

## 🎯 Цели

1. Реализовать CRUD для объектов
2. Реализовать управление этажами и планами
3. Реализовать экспликацию помещений
4. Реализовать конструктор маршрутов
5. Реализовать технологические карты

---

## 📁 Структура проекта
backend/core-service/
├── src/
│ ├── main.ts
│ ├── app.module.ts
│ ├── objects/
│ │ ├── objects.controller.ts
│ │ ├── objects.service.ts
│ │ ├── objects.module.ts
│ │ ├── entities/object.entity.ts
│ │ └── dto/
│ │ ├── create-object.dto.ts
│ │ └── update-object.dto.ts
│ ├── floors/
│ │ ├── floors.controller.ts
│ │ ├── floors.service.ts
│ │ ├── floors.module.ts
│ │ └── dto/
│ ├── rooms/
│ │ ├── rooms.controller.ts
│ │ ├── rooms.service.ts
│ │ ├── rooms.module.ts
│ │ └── dto/
│ ├── routes/
│ │ ├── routes.controller.ts
│ │ ├── routes.service.ts
│ │ ├── routes.module.ts
│ │ └── dto/
│ ├── route-points/
│ │ ├── route-points.controller.ts
│ │ ├── route-points.service.ts
│ │ └── route-points.module.ts
│ ├── tech-cards/
│ │ ├── tech-cards.controller.ts
│ │ ├── tech-cards.service.ts
│ │ └── tech-cards.module.ts
│ └── common/
│ ├── filters/
│ ├── interceptors/
│ └── pipes/
├── prisma/
│ ├── schema.prisma
│ └── migrations/
├── test/
├── Dockerfile
└── package.json

text

---

## 📝 Инструкции по реализации

### 1. Схема БД

```prisma
model Object {
  id          String   @id @default(uuid())
  name        String
  address     String
  lat         Float
  lng         Float
  type        String
  totalArea   Float
  floorsCount Int
  clientName  String
  clientContact String
  status      ObjectStatus @default(ACTIVE)
  floors      Floor[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Floor {
  id            String  @id @default(uuid())
  objectId      String
  object        Object  @relation(fields: [objectId], references: [id])
  number        Int
  name          String
  planImageUrl  String?
  planScale     Float?
  rooms         Room[]
  routes        Route[]
}

model Room {
  id          String  @id @default(uuid())
  floorId     String
  floor       Floor   @relation(fields: [floorId], references: [id])
  name        String
  areaM2      Float
  floorType   String
  coordsX     Int?
  coordsY     Int?
  coordsWidth Int?
  coordsHeight Int?
  zone        String?
  techCardId  String?
  techCard    TechCard? @relation(fields: [techCardId], references: [id])
}

model Route {
  id       String       @id @default(uuid())
  floorId  String
  floor    Floor        @relation(fields: [floorId], references: [id])
  name     String
  status   RouteStatus  @default(DRAFT)
  points   RoutePoint[]
}

model RoutePoint {
  id          String  @id @default(uuid())
  routeId     String
  route       Route   @relation(fields: [routeId], references: [id])
  roomId      String
  room        Room    @relation(fields: [roomId], references: [id])
  orderIndex  Int
  estimatedTimeMin Int?
}

model TechCard {
  id         String     @id @default(uuid())
  name       String
  operations TechOperation[]
  rooms      Room[]
}

model TechOperation {
  id            String  @id @default(uuid())
  techCardId    String
  techCard      TechCard @relation(fields: [techCardId], references: [id])
  name          String
  orderIndex    Int
  description   String?
  equipment     Json?
  estimatedTimeMin Int
  requiresPhoto Boolean @default(false)
  requiresQr    Boolean @default(false)
  materials     TechOperationMaterial[]
}

model TechOperationMaterial {
  id              String  @id @default(uuid())
  operationId     String
  operation       TechOperation @relation(fields: [operationId], references: [id])
  materialId      String
  consumptionPerOperation Float
  unit            String
}
2. Ключевые endpoints
typescript
// Маршруты
@Post('api/routes/:id/reorder')
async reorderPoints(@Param('id') routeId: string, @Body() dto: ReorderPointsDto) {
  // Изменение порядка точек маршрута
  // dto: { pointIds: ['point1', 'point2', ...] }
}
3. Загрузка планов
typescript
// floors.controller.ts
@Post('api/floors/:id/plan')
@UseInterceptors(FileInterceptor('file'))
async uploadPlan(
  @Param('id') floorId: string,
  @UploadedFile() file: Express.Multer.File,
  @Body('scale') scale: string,
) {
  // 1. Валидация файла (PNG, JPG, PDF, SVG)
  // 2. Загрузка в S3/MinIO
  // 3. Сохранение URL в БД
  // 4. Сохранение масштаба
}
✅ Acceptance Criteria
□ CRUD объектов работает
□ Загрузка планов этажей работает
□ Экспликация помещений работает
□ Конструктор маршрутов работает
□ Изменение порядка точек работает
□ Технологические карты работают
□ Привязка техкарт к помещениям работает
□ Загрузка файлов работает
□ Unit-тесты > 80%
□ E2E тесты проходят
