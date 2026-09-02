<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: BACKEND NOTIFICATIONS
# 🤖 АГЕНТ: BACKEND NOTIFICATION SERVICE

## 📋 Профиль агента

**Роль:** Backend Developer (Notifications)  
**Ответственность:** Push-уведомления, in-app уведомления  
**Рабочая директория:** `backend/notification-service/`  
**Технологии:** NestJS, Firebase Admin, RabbitMQ, PostgreSQL  
**Отчетность:** Backend Architect

---

## 🎯 Цели

1. Push-уведомления (Firebase)
2. In-app уведомления
3. Шаблоны уведомлений
4. Триггеры уведомлений
5. Настройки пользователя

---

## 📝 Инструкции по реализации

### 1. Firebase интеграция

```typescript
// firebase.config.ts
import * as admin from 'firebase-admin';

export function initializeFirebase() {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export const firebaseMessaging = admin.messaging();
2. Отправка push
typescript
// notification.service.ts
@Injectable()
export class NotificationService {
  
  async sendPush(userId: string, notification: NotificationPayload): Promise<void> {
    // 1. Получить токены устройства
    const tokens = await this.getUserTokens(userId);
    
    if (tokens.length === 0) return;
    
    // 2. Отправить push
    try {
      await firebaseMessaging.sendEachForMulticast({
        tokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data,
        android: {
          priority: notification.priority === 'high' ? 'high' : 'normal',
          notification: {
            sound: 'default',
            channelId: notification.type,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });
    } catch (error) {
      // Обработка ошибок
      await this.handleFailedTokens(tokens, error);
    }
    
    // 3. Сохранить in-app уведомление
    await this.saveInAppNotification(userId, notification);
  }
}
3. Шаблоны уведомлений
typescript
// notification-templates.ts
export const NOTIFICATION_TEMPLATES = {
  NEW_TICKET: {
    title: 'Новая задача',
    body: 'Вам назначена задача: {ticketDescription}',
    priority: 'normal',
    type: 'new_ticket',
  },
  EMERGENCY: {
    title: '🚨 АВАРИЙНАЯ СИТУАЦИЯ',
    body: '{type} на объекте {objectName}, {floor}',
    priority: 'high',
    type: 'emergency',
  },
  TICKET_OVERDUE: {
    title: '⚠️ Заявка просрочена',
    body: 'Заявка {ticketId} просрочена на {minutes} минут',
    priority: 'high',
    type: 'overdue',
  },
  GEOFENCE_EXIT: {
    title: '⚠️ Внимание',
    body: '{employeeName} покинул территорию объекта',
    priority: 'normal',
    type: 'geofence_exit',
  },
  MATERIAL_LOW: {
    title: '📦 Материал заканчивается',
    body: '{materialName} на объекте {objectName} ниже порога',
    priority: 'normal',
    type: 'material_low',
  },
};
4. Триггеры (RabbitMQ)
typescript
// notification.consumer.ts
@Injectable()
export class NotificationConsumer {
  
  @RabbitSubscribe({
    exchange: 'cleaning-ops.events',
    routingKey: 'ticket.created',
    queue: 'notification.ticket.created',
  })
  async handleTicketCreated(event: TicketCreatedEvent) {
    // Отправить уведомление назначенному оператору
    await this.notificationService.sendPush(event.assigneeId, {
      ...NOTIFICATION_TEMPLATES.NEW_TICKET,
      data: { ticketId: event.ticketId },
    });
  }
  
  @RabbitSubscribe({
    exchange: 'cleaning-ops.events',
    routingKey: 'ticket.emergency',
    queue: 'notification.ticket.emergency',
  })
  async handleEmergencyTicket(event: EmergencyTicketEvent) {
    // Отправить всем операторам в радиусе
    await this.notificationService.sendToNearbyOperators(event);
  }
}
✅ Acceptance Criteria
□ Push-уведомления доходят до устройств
□ In-app уведомления сохраняются
□ Шаблоны работают
□ Триггеры работают
□ Настройки пользователя работают
□ Обработка ошибок (невалидные токены)
