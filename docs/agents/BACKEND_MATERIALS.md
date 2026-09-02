<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: BACKEND MATERIALS
# 🤖 АГЕНТ: BACKEND MATERIAL SERVICE

## 📋 Профиль агента

**Роль:** Backend Developer (Materials)  
**Ответственность:** Материалы, склад, расход  
**Рабочая директория:** `backend/material-service/`  
**Технологии:** NestJS, TypeScript, PostgreSQL, RabbitMQ  
**Отчетность:** Backend Architect

---

## 🎯 Цели

1. CRUD материалов
2. Складские остатки по объектам
3. Движение материалов
4. Автоматическое списание
5. Уведомления о низких остатках

---

## 📝 Инструкции по реализации

### 1. Схема БД

```prisma
model Material {
  id                  String   @id @default(uuid())
  name                String
  unit                String
  defaultConsumption  Float
  minStockThreshold   Float
  costPerUnit         Float
  supplier            String?
  stocks              MaterialStock[]
  movements           MaterialMovement[]
}

model MaterialStock {
  id          String   @id @default(uuid())
  materialId  String
  material    Material @relation(fields: [materialId], references: [id])
  objectId    String
  quantity    Float
  updatedAt   DateTime @updatedAt
  
  @@unique([materialId, objectId])
}

model MaterialMovement {
  id          String   @id @default(uuid())
  materialId  String
  material    Material @relation(fields: [materialId], references: [id])
  objectId    String
  type        MovementType
  quantity    Float
  ticketId    String?
  userId      String
  createdAt   DateTime @default(now())
}

enum MovementType {
  IN          // Приход
  OUT         // Расход
  TRANSFER    // Перемещение
  WRITE_OFF   // Списание
}
2. Автоматическое списание
typescript
// material-consumption.service.ts
@Injectable()
export class MaterialConsumptionService {
  
  @OnEvent('ticket.operation.completed')
  async handleOperationCompleted(event: OperationCompletedEvent) {
    const { operationId, ticketId, objectId } = event;
    
    // 1. Получить материалы из техкарты
    const operationMaterials = await this.getOperationMaterials(operationId);
    
    // 2. Списать материалы
    for (const material of operationMaterials) {
      await this.consumeMaterial({
        materialId: material.materialId,
        objectId,
        quantity: material.consumptionPerOperation,
        ticketId,
        type: MovementType.OUT,
      });
      
      // 3. Проверить порог
      await this.checkThreshold(material.materialId, objectId);
    }
  }
}
✅ Acceptance Criteria
□ CRUD материалов работает
□ Складские остатки корректны
□ Движение материалов записывается
□ Автоматическое списание работает
□ Уведомления о низких остатках работают
□ Отчеты по расходу формируются
