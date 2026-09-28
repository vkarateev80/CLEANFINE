import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import {
  CreateMaterialDto,
  CreateMovementDto,
  ListMaterialsQueryDto,
  MovementsQueryDto,
  ReportQueryDto,
  StocksQueryDto,
  UpdateMaterialDto,
} from './dto/material.dto';
import { MaterialsService } from './materials.service';

/**
 * Порядок методов важен: статические пути (`stocks`, `movements`, `report`)
 * объявлены до `:id`, иначе Nest принял бы их за идентификатор материала.
 */
@ApiTags('materials')
@ApiBearerAuth('access-token')
@Controller('api/materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  // -------------------------------------------------------------- справочник

  @Post()
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Создать материал (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 201, description: 'Материал создан' })
  @ApiResponse({ status: 400, description: 'Ошибка валидации' })
  async create(@Body() dto: CreateMaterialDto) {
    return this.materials.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Справочник материалов (поиск + пагинация)' })
  @ApiResponse({ status: 200, description: '{ items, total }' })
  async list(@Query() query: ListMaterialsQueryDto) {
    return this.materials.list(query);
  }

  // -------------------------------------------------------------- склад/отчёт

  @Get('stocks')
  @ApiOperation({
    summary: 'Остатки материалов по объектам',
    description:
      'objectId — фильтр по объекту; onlyLow=true — только позиции ниже порога. ' +
      'В ответе название материала, единица и признак belowThreshold.',
  })
  @ApiResponse({ status: 200, description: '{ items: StockView[], total }' })
  async stocks(@Query() query: StocksQueryDto) {
    return this.materials.listStocks(query);
  }

  @Post('movements')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  @ApiOperation({
    summary: 'Движение материала: IN / OUT / TRANSFER / WRITE_OFF',
    description:
      'IN и TRANSFER увеличивают остаток, OUT и WRITE_OFF уменьшают. Пересчёт ' +
      'транзакционный: попытка уйти в минус → 400. Для TRANSFER обязателен ' +
      'targetObjectId (списание с objectId, приход на targetObjectId).',
  })
  @ApiResponse({ status: 201, description: '{ movement, stocks }' })
  @ApiResponse({ status: 400, description: 'Недостаточно материала или неверный тип движения' })
  @ApiResponse({ status: 404, description: 'Материал не найден' })
  async createMovement(@Body() dto: CreateMovementDto, @CurrentUser() user: AuthUser) {
    return this.materials.createMovement({
      materialId: dto.materialId,
      objectId: dto.objectId,
      type: dto.type,
      quantity: dto.quantity,
      targetObjectId: dto.targetObjectId,
      ticketId: dto.ticketId,
      userId: user?.id ?? 'unknown',
    });
  }

  @Get('report')
  @ApiOperation({
    summary: 'Отчёт по расходу за объект и период',
    description:
      'Агрегаты OUT/WRITE_OFF по материалам (сумма расхода, количество операций) ' +
      'и итог по стоимости (costPerUnit справочника).',
  })
  @ApiResponse({ status: 200, description: 'ConsumptionReport' })
  async report(@Query() query: ReportQueryDto) {
    return this.materials.report(query);
  }

  // --------------------------------------------------------------------- :id

  @Get(':id/movements')
  @ApiOperation({ summary: 'История движений материала (objectId, from, to, limit)' })
  @ApiResponse({ status: 200, description: '{ items, total }' })
  @ApiResponse({ status: 404, description: 'Материал не найден' })
  async movements(@Param('id') id: string, @Query() query: MovementsQueryDto) {
    return this.materials.listMovements(id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Материал по id вместе с остатками по объектам' })
  @ApiResponse({ status: 404, description: 'Материал не найден' })
  async getById(@Param('id') id: string) {
    return this.materials.getById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({
    summary: 'Изменить материал (ADMIN, SUPERVISOR)',
    description: 'supplier: null очищает поставщика, отсутствие поля — не менять.',
  })
  @ApiResponse({ status: 404, description: 'Материал не найден' })
  async update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.materials.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({
    summary: 'Удалить материал (ADMIN, SUPERVISOR)',
    description:
      'Каскадом удаляются остатки и история движений материала, а строки идемпотентности ' +
      'автосписания (ConsumedOperation) удаляются вместе с материалом явно — FK на материал у них нет.',
  })
  @ApiResponse({ status: 204, description: 'Материал удалён' })
  async remove(@Param('id') id: string) {
    await this.materials.remove(id);
  }
}
