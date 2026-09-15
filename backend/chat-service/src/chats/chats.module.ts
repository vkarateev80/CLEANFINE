import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

/**
 * Модуль чата: сервис домена, REST-контроллер и WebSocket-шлюз.
 *
 * JwtModule регистрируется локально с ОБЩИМ секретом (jwt.accessSecret), потому
 * что handshake сокета проверяется вручную в ChatGateway: глобальный
 * JwtAuthGuard работает только в HTTP-конвейере. Без секрета verifyAsync падал
 * бы и любое соединение отклонялось как неавторизованное.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret') ?? 'dev-access-secret',
      }),
    }),
  ],
  controllers: [ChatsController],
  providers: [ChatsService, ChatGateway],
  exports: [ChatsService, ChatGateway],
})
export class ChatsModule {}
