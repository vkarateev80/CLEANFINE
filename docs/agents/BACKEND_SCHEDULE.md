<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: BACKEND SCHEDULE
# 🤖 АГЕНТ: BACKEND SCHEDULE SERVICE

## 📋 Профиль агента

**Роль:** Backend Developer (Schedule)  
**Ответственность:** Графики, смены, check-in/check-out  
**Рабочая директория:** `backend/schedule-service/`  
**Технологии:** NestJS, TypeScript, PostgreSQL, Bull Queue  
**Отчетность:** Backend Architect

---

## 🎯 Цели

1. CRUD графиков
2. Рекуррентные расписания
3. Check-in / Check-out с геолокацией
4. Автосоздание заявок по графику
5. Уведомления о невыходе

---

## 📝 Инструкции по реализации

### 1. Рекуррентные расписания

```typescript
// schedule.service.ts
@Injectable()
export class ScheduleService {
  
  async createSchedule(dto: CreateScheduleDto): Promise<Schedule> {
    // dto: {
    //   objectId: 'uuid',
    //   routeId: 'uuid',
    //   name: 'Ежедневная уборка',
    //   recurrence: {
    //     frequency: 'weekly', // daily | weekly | monthly
    //     days: [1, 2, 3, 4, 5], // Пн-Пт
    //     time: '08:00',
    //   },
    //   assignees: ['uuid1', 'uuid2'],
    // }
  }
  
  @Cron('0 0 * * *') // Каждый день в полночь
  async generateDailyEvents() {
    // Создать события на сегодня для всех активных графиков
  }
  
  @Cron('*/5 * * * *') // Каждые 5 минут
  async checkMissedCheckins() {
    // Проверить, кто не отметился
    // Отправить уведомления
  }
}
2. Check-in с геолокацией
typescript
async checkIn(userId: string, dto: CheckInDto): Promise<ScheduleEvent> {
  // dto: { lat, lng, scheduleId }
  
  // 1. Проверить геолокацию
  const isInGeofence = await this.gpsService.checkGeofence(userId, dto.lat, dto.lng);
  
  if (!isInGeofence) {
    throw new ForbiddenException('Вы находитесь вне зоны объекта');
  }
  
  // 2. Создать событие check-in
  return await this.createEvent({
    userId,
    scheduleId: dto.scheduleId,
    type: 'CHECK_IN',
    timestamp: new Date(),
    lat: dto.lat,
    lng: dto.lng,
  });
}
✅ Acceptance Criteria
□ CRUD графиков работает
□ Рекуррентные расписания работают
□ Check-in с геолокацией работает
□ Check-out работает
□ Автосоздание заявок работает
□ Уведомления о невыходе работают
□ Авто check-out при бездействии работает
