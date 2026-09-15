import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import { ChatGateway } from './chat.gateway';
import { ChatsService } from './chats.service';
import {
  CreateChatDto,
  ListMessagesQueryDto,
  MarkReadDto,
  SearchMessagesQueryDto,
  SendMessageDto,
} from './dto/chat.dto';

/**
 * REST чата (М5.1–М5.2). Префикс /api/chat, все эндпоинты — под JWT.
 *
 * Порядок методов важен: статические пути (`chats`, `messages/search`) объявлены
 * раньше `chats/:id`, иначе Nest принял бы их за идентификатор.
 */
@ApiTags('chat')
@ApiBearerAuth('access-token')
@Controller('api/chat')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly gateway: ChatGateway,
  ) {}

  // ------------------------------------------------------------------- список

  @Get('chats')
  @ApiOperation({
    summary: 'Чаты текущего пользователя',
    description:
      'Только чаты, где пользователь участник. Сортировка — по последнему сообщению ' +
      '(свежие выше). В ответе: id, type, title, objectId, ticketId, lastMessage (превью) ' +
      'и unreadCount.',
  })
  @ApiResponse({ status: 200, description: 'Массив ChatSummary' })
  async listMyChats(@CurrentUser() user: AuthUser) {
    return this.chats.listMyChats(user);
  }

  @Post('chats')
  @ApiOperation({
    summary: 'Создать чат',
    description:
      'direct — любой авторизованный (себя добавляет сам, указывает второго участника); ' +
      'object/ticket — ADMIN или SUPERVISOR; system — только ADMIN. ' +
      'Для ticket обязателен ticketId, для object — objectId. Повторное создание ' +
      'ticket/object-чата возвращает существующий (идемпотентность).',
  })
  @ApiResponse({ status: 201, description: 'Чат создан (или возвращён существующий)' })
  @ApiResponse({ status: 400, description: 'Ошибка валидации (нет ticketId/objectId и т.п.)' })
  @ApiResponse({ status: 403, description: 'Недостаточно прав для выбранного типа чата' })
  async createChat(@Body() dto: CreateChatDto, @CurrentUser() user: AuthUser) {
    return this.chats.createChat(dto, user);
  }

  // -------------------------------------------------------------------- поиск

  @Get('messages/search')
  @ApiOperation({
    summary: 'Поиск сообщений по тексту',
    description:
      'ILIKE (регистронезависимо) только по чатам, где пользователь участник. ' +
      'chatId ограничивает поиск одним своим чатом (чужой → 403).',
  })
  @ApiResponse({ status: 200, description: '{ items, total }' })
  @ApiResponse({ status: 403, description: 'Вы не участник этого чата' })
  async search(@Query() query: SearchMessagesQueryDto, @CurrentUser() user: AuthUser) {
    return this.chats.search(query, user);
  }

  // ------------------------------------------------------------------- деталь

  @Get('chats/:id')
  @ApiOperation({ summary: 'Деталь чата с участниками' })
  @ApiResponse({ status: 200, description: 'ChatDetail' })
  @ApiResponse({ status: 403, description: 'Вы не участник этого чата' })
  @ApiResponse({ status: 404, description: 'Чат не найден' })
  async getChat(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.chats.getChat(id, user);
  }

  @Get('chats/:id/messages')
  @ApiOperation({
    summary: 'История сообщений чата (пагинация по курсору before)',
    description:
      'items идут от старых к новым внутри страницы; hasMore — есть ли ещё выше, ' +
      'nextBefore — курсор для следующего запроса. limit ≤ 100, по умолчанию 50.',
  })
  @ApiResponse({ status: 200, description: '{ items, limit, hasMore, nextBefore }' })
  @ApiResponse({ status: 403, description: 'Вы не участник этого чата' })
  @ApiResponse({ status: 404, description: 'Чат не найден' })
  async listMessages(
    @Param('id') id: string,
    @Query() query: ListMessagesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chats.listMessages(id, query, user);
  }

  @Post('chats/:id/messages')
  @ApiOperation({
    summary: 'Отправить сообщение (REST-фолбэк; основной путь — WebSocket message:send)',
    description:
      'Сохраняет сообщение, рассылает message:new онлайн-участникам (кроме отправителя) ' +
      'и отправляет push оффлайн-получателям.',
  })
  @ApiResponse({ status: 201, description: 'MessageView' })
  @ApiResponse({ status: 400, description: 'Пустое сообщение или превышена длина' })
  @ApiResponse({ status: 403, description: 'Вы не участник этого чата' })
  @ApiResponse({ status: 404, description: 'Чат не найден' })
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const plan = await this.chats.sendMessage(id, dto, user, this.gateway.getOnlineUserIds());
    // Онлайн-получатели узнают о сообщении мгновенно; оффлайн получили push
    // внутри sendMessage. Отправителю сообщение возвращается в ответе — дублировать
    // ему message:new не нужно, поэтому excludeUserId не требуется.
    this.gateway.emitMessageNew(plan);
    return plan.message;
  }

  @Post('chats/:id/read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Отметить сообщения прочитанными',
    description:
      'lastReadAt = createdAt указанного сообщения (не now): повторное чтение старого ' +
      'сообщения не скрывает новые. Автору сообщения уходит message:read.',
  })
  @ApiResponse({ status: 200, description: '{ chatId, userId, lastMessageId, readAt }' })
  @ApiResponse({ status: 403, description: 'Вы не участник этого чата' })
  @ApiResponse({ status: 404, description: 'Чат или сообщение не найдены' })
  async markRead(
    @Param('id') id: string,
    @Body() dto: MarkReadDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.chats.markRead(id, dto, user);
    this.gateway.emitMessageRead(result);
    return result;
  }
}
