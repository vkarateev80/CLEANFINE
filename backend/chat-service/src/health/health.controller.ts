import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ChatGateway } from '../chats/chat.gateway';

/**
 * Health-чек: используется стендом и docker-compose.
 * Публичный (без JWT) — как в соседних сервисах.
 */
@ApiTags('health')
@Controller('api/chat')
export class HealthController {
  constructor(private readonly gateway: ChatGateway) {}

  @Get('health')
  @Public()
  @ApiOperation({
    summary: 'Проверка живости сервиса',
    description: 'Возвращает статус и число пользователей с активным WebSocket-соединением.',
  })
  @ApiResponse({ status: 200, description: '{ status, service, online }' })
  health() {
    return {
      status: 'ok',
      service: 'chat-service',
      online: this.gateway.getOnlineSnapshot(),
    };
  }
}
