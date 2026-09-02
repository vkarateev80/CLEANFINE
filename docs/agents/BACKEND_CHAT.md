<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: BACKEND CHAT
# 🤖 АГЕНТ: BACKEND CHAT SERVICE

## 📋 Профиль агента

**Роль:** Backend Developer (Chat)  
**Ответственность:** Чат, WebSocket, сообщения  
**Рабочая директория:** `backend/chat-service/`  
**Технологии:** NestJS, Socket.io, Redis (Pub/Sub), PostgreSQL  
**Отчетность:** Backend Architect

---

## 🎯 Цели

1. WebSocket сервер
2. Типы чатов: object, ticket, direct
3. Отправка сообщений
4. Файлы в чате
5. Статус прочтения

---

## 📝 Инструкции по реализации

### 1. WebSocket Gateway

```typescript
// chat.gateway.ts
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  
  @WebSocketServer()
  server: Server;
  
  private onlineUsers = new Map<string, string>(); // userId -> socketId
  
  async handleConnection(client: Socket) {
    const userId = this.extractUserId(client);
    if (!userId) {
      client.disconnect();
      return;
    }
    
    this.onlineUsers.set(userId, client.id);
    
    // Отправить статус онлайн всем
    this.broadcastUserStatus(userId, true);
  }
  
  async handleDisconnect(client: Socket) {
    const userId = this.findUserIdBySocketId(client.id);
    if (userId) {
      this.onlineUsers.delete(userId);
      this.broadcastUserStatus(userId, false);
    }
  }
  
  @SubscribeMessage('message:send')
  async handleMessage(client: Socket, payload: SendMessageDto) {
    // 1. Сохранить в БД
    const message = await this.saveMessage(payload);
    
    // 2. Отправить получателям
    const recipientIds = await this.getRecipients(payload.chatId);
    for (const recipientId of recipientIds) {
      const socketId = this.onlineUsers.get(recipientId);
      if (socketId) {
        this.server.to(socketId).emit('message:new', message);
      }
    }
    
    // 3. Отправить push-уведомление оффлайн пользователям
    await this.notifyOfflineUsers(recipientIds, message);
  }
  
  @SubscribeMessage('message:read')
  async handleRead(client: Socket, payload: ReadMessageDto) {
    // Отметить сообщение как прочитанное
    await this.markAsRead(payload.messageId, payload.userId);
    
    // Уведомить отправителя
    const senderSocketId = this.getSocketId(payload.senderId);
    if (senderSocketId) {
      this.server.to(senderSocketId).emit('message:read', {
        messageId: payload.messageId,
        readBy: payload.userId,
        readAt: new Date(),
      });
    }
  }
}
2. Типы чатов
typescript
export enum ChatType {
  OBJECT = 'object',   // Чат объекта (все сотрудники)
  TICKET = 'ticket',   // Чат заявки (исполнитель, бригадир, админ)
  DIRECT = 'direct',   // Личные сообщения
  SYSTEM = 'system',   // Системные уведомления
}
✅ Acceptance Criteria
□ WebSocket работает
□ Сообщения доставляются в реальном времени
□ Файлы прикрепляются
□ Статус прочтения работает
□ Онлайн/оффлайн статус работает
□ Push-уведомления для оффлайн
□ История сообщений сохраняется
