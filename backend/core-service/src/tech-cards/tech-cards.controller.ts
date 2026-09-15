import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateOperationDto,
  CreateTechCardDto,
  ReorderOperationsDto,
  UpdateOperationDto,
  UpdateTechCardDto,
} from './dto/tech-card.dto';
import { TechCardsService } from './tech-cards.service';

@ApiTags('tech-cards')
@ApiBearerAuth('access-token')
@Controller('api/tech-cards')
export class TechCardsController {
  constructor(private readonly techCards: TechCardsService) {}

  @Post()
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Создать техкарту (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 201, description: 'Техкарта создана' })
  async create(@Body() dto: CreateTechCardDto) {
    return this.techCards.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Список техкарт с числом операций и помещений' })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @ApiQuery({ name: 'take', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'search', required: false, type: String })
  async list(
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
    @Query('search') search?: string,
  ) {
    return this.techCards.list({ skip, take, search });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Техкарта с операциями, материалами и помещениями',
    description: 'Ответ содержит totalEstimatedTimeMin — сумму времени операций.',
  })
  @ApiResponse({ status: 404, description: 'Техкарта не найдена' })
  async getById(@Param('id') id: string) {
    return this.techCards.getDetail(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Переименовать техкарту (ADMIN, SUPERVISOR)' })
  async update(@Param('id') id: string, @Body() dto: UpdateTechCardDto) {
    return this.techCards.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Удалить техкарту (только ADMIN)',
    description: 'Помещения, где использовалась техкарта, сохраняются — связь обнуляется.',
  })
  async remove(@Param('id') id: string) {
    await this.techCards.remove(id);
  }

  @Post(':id/operations')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Добавить операцию (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 201, description: 'Операция создана' })
  async addOperation(@Param('id') id: string, @Body() dto: CreateOperationDto) {
    return this.techCards.addOperation(id, dto);
  }

  @Patch(':id/reorder')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({
    summary: 'Переупорядочить операции техкарты (ADMIN, SUPERVISOR)',
    description:
      'Передаётся ПОЛНЫЙ список operationIds в новом порядке. Неполный список или чужие операции → 400.',
  })
  @ApiResponse({ status: 200, description: 'Операции в новом порядке' })
  async reorder(@Param('id') id: string, @Body() dto: ReorderOperationsDto) {
    return this.techCards.reorderOperations(id, dto);
  }
}

@ApiTags('tech-cards')
@ApiBearerAuth('access-token')
@Controller('api/tech-operations')
export class TechOperationsController {
  constructor(private readonly techCards: TechCardsService) {}

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({
    summary: 'Изменить операцию (ADMIN, SUPERVISOR)',
    description: 'materials заменяет список материалов операции целиком.',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateOperationDto) {
    return this.techCards.updateOperation(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({
    summary: 'Удалить операцию (ADMIN, SUPERVISOR)',
    description: 'Порядковые номера оставшихся операций пересобираются.',
  })
  async remove(@Param('id') id: string) {
    await this.techCards.removeOperation(id);
  }
}
