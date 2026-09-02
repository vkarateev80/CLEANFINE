<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: BACKEND TICKETS
# 🤖 АГЕНТ: BACKEND TICKET SERVICE

## 📋 Профиль агента

**Роль:** Backend Developer (Tickets)  
**Ответственность:** Заявки, статусы, state machine, аварийные заявки  
**Рабочая директория:** `backend/ticket-service/`  
**Технологии:** NestJS, TypeScript, PostgreSQL, Redis (таймеры), RabbitMQ  
**Отчетность:** Backend Architect

---

## 🎯 Цели

1. Реализовать модель заявок
2. Реализовать state machine для статусов
3. Реализовать плановые, внеплановые и аварийные заявки
4. Реализовать таймеры и эскалацию
5. Интеграция с notification-service

---

## 📝 Инструкции по реализации

### 1. Статусная модель (State Machine)

```typescript
// ticket-states.ts
export enum TicketStatus {
  NEW = 'new',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  CLOSED = 'closed',
  OVERDUE = 'overdue',
}

export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.NEW]: [TicketStatus.ASSIGNED, TicketStatus.REJECTED],
  [TicketStatus.ASSIGNED]: [TicketStatus.IN_PROGRESS, TicketStatus.REJECTED, TicketStatus.OVERDUE],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.PAUSED, TicketStatus.COMPLETED, TicketStatus.OVERDUE],
  [TicketStatus.PAUSED]: [TicketStatus.IN_PROGRESS, TicketStatus.OVERDUE],
  [TicketStatus.COMPLETED]: [TicketStatus.VERIFIED, TicketStatus.REJECTED],
  [TicketStatus.VERIFIED]: [TicketStatus.CLOSED],
  [TicketStatus.REJECTED]: [TicketStatus.ASSIGNED, TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
  [TicketStatus.OVERDUE]: [TicketStatus.IN_PROGRESS, TicketStatus.COMPLETED, TicketStatus.CLOSED],
};
2. Типы заявок
typescript
// ticket-types.ts
export enum TicketType {
  PLANNED = 'planned',
  UNSCHEDULED = 'unscheduled',
  EMERGENCY = 'emergency',
}

export enum TicketPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}
3. Аварийные заявки (SOS)
typescript
// emergency-ticket.service.ts
@Injectable()
export class EmergencyTicketService {
  
  async createEmergency(dto: EmergencyTicketDto): Promise<Ticket> {
    // 1. Создать заявку с приоритетом CRITICAL
    const ticket = await this.create({
      ...dto,
      type: TicketType.EMERGENCY,
      priority: TicketPriority.CRITICAL,
    });

    // 2. Найти свободных операторов в радиусе 500м
    const operators = await this.findNearbyOperators(dto.lat, dto.lng, 500);

    // 3. Отправить push-уведомления
    await this.notifyOperators(operators, ticket);

    // 4. Отправить уведомления бригадиру и админу
    await this.notifySupervisors(ticket);

    // 5. Запустить таймер реакции (5 минут)
    await this.startReactionTimer(ticket);

    return ticket;
  }

  private async startReactionTimer(ticket: Ticket) {
    // Redis TTL или Bull Queue с задержкой
    await this.queue.add('check-reaction', { ticketId: ticket.id }, {
      delay: 5 * 60 * 1000, // 5 минут
    });
  }
}
4. Таймеры эскалации
typescript
// ticket-timers.service.ts
@Injectable()
export class TicketTimersService {
  
  // Создание → Принятие: 5 минут
  // Принятие → Прибытие: 15 минут
  // Прибытие → Выполнение: 60 минут

  async checkReaction(ticketId: string) {
    const ticket = await this.findById(ticketId);
    
    if (ticket.status === TicketStatus.NEW) {
      // Эскалация на админа
      await this.escalateToAdmin(ticket);
    }
  }
}
✅ Acceptance Criteria
□ State machine работает с валидацией
□ Плановые заявки создаются по расписанию
□ Внеплановые заявки создаются
□ Аварийные заявки работают
□ Таймеры эскалации работают
□ Уведомления отправляются
□ Назначение исполнителей работает
□ Комментарии работают
□ Unit-тесты > 80%
