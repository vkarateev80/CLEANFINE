import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  AddRoutePointDto,
  CreateRouteDto,
  ReorderPointsDto,
  UpdateRouteDto,
  UpdateRoutePointDto,
} from './dto/route.dto';
import { RoutesService } from './routes.service';

@ApiTags('routes')
@ApiBearerAuth('access-token')
@Controller('api/floors/:floorId/routes')
export class FloorRoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Post()
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Создать маршрут на этаже (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 201, description: 'Маршрут создан (статус DRAFT)' })
  async create(@Param('floorId') floorId: string, @Body() dto: CreateRouteDto) {
    return this.routes.create(floorId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Маршруты этажа с точками' })
  async list(@Param('floorId') floorId: string) {
    return this.routes.listByFloor(floorId);
  }
}

@ApiTags('routes')
@ApiBearerAuth('access-token')
@Controller('api/routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Маршрут с точками и суммарным временем' })
  @ApiResponse({ status: 404, description: 'Маршрут не найден' })
  async getById(@Param('id') id: string) {
    return this.routes.getDetail(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Изменить маршрут или его статус (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 400, description: 'Недопустимый переход статуса' })
  async update(@Param('id') id: string, @Body() dto: UpdateRouteDto) {
    return this.routes.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Удалить маршрут (только ADMIN), каскадом точки' })
  async remove(@Param('id') id: string) {
    await this.routes.remove(id);
  }

  @Post(':id/points')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Добавить точку в конец маршрута (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 400, description: 'Помещение с другого этажа' })
  async addPoint(@Param('id') id: string, @Body() dto: AddRoutePointDto) {
    return this.routes.addPoint(id, dto);
  }

  @Patch(':id/reorder')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({
    summary: 'Переупорядочить точки маршрута (ADMIN, SUPERVISOR)',
    description:
      'Передаётся ПОЛНЫЙ список pointIds в новом порядке. Неполный список или чужие точки → 400. ' +
      'Перестановка транзакционная.',
  })
  @ApiResponse({ status: 200, description: '{ points } в новом порядке' })
  @ApiResponse({ status: 400, description: 'Чужие точки или неполный список' })
  async reorder(@Param('id') id: string, @Body() dto: ReorderPointsDto) {
    return this.routes.reorderPoints(id, dto);
  }
}

@ApiTags('routes')
@ApiBearerAuth('access-token')
@Controller('api/route-points')
export class RoutePointsController {
  constructor(private readonly routes: RoutesService) {}

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Изменить точку маршрута (ADMIN, SUPERVISOR)' })
  async update(@Param('id') id: string, @Body() dto: UpdateRoutePointDto) {
    return this.routes.updatePoint(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({
    summary: 'Удалить точку маршрута (ADMIN, SUPERVISOR)',
    description: 'Порядковые номера оставшихся точек пересобираются без «дыр».',
  })
  async remove(@Param('id') id: string) {
    await this.routes.removePoint(id);
  }
}
