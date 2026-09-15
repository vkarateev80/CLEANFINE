import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import {
  CreateGeofenceDto,
  GeofenceCheckQueryDto,
  GeofenceListQueryDto,
  NearbyEmployeesQueryDto,
  TrackBatchDto,
  TrackHistoryQueryDto,
} from './dto/gps.dto';
import { GeofenceService } from './geofence.service';
import { GpsService } from './gps.service';

@ApiTags('gps')
@ApiBearerAuth('access-token')
@Controller('api/gps')
export class GpsController {
  constructor(
    private readonly gps: GpsService,
    private readonly geofences: GeofenceService,
  ) {}

  @Post('track')
  @ApiOperation({
    summary: 'Batch-приём GPS-координат',
    description:
      'Точки пишутся одним INSERT, затем проверяются геозоны: если сотрудник был внутри ' +
      'геозоны, а последняя точка batch — уже вне неё, публикуется geofence.exit. ' +
      'Недоступность RabbitMQ не влияет на ответ (событие теряется с warning).',
  })
  @ApiResponse({ status: 201, description: '{ userId, accepted, geofenceExits }' })
  @ApiResponse({ status: 400, description: 'Ошибка валидации batch' })
  @ApiResponse({ status: 403, description: 'Попытка записать треки за другого сотрудника' })
  async track(@Body() dto: TrackBatchDto, @CurrentUser() user: AuthUser) {
    return this.gps.trackBatch(dto, user);
  }

  @Get('geofences')
  @ApiOperation({
    summary: 'Список геозон',
    description: 'Все геозоны (границы — GeoJSON) или только геозоны одного объекта (?objectId=).',
  })
  @ApiResponse({ status: 200, description: '{ count, geofences }' })
  async listGeofences(@Query() query: GeofenceListQueryDto) {
    const geofences = await this.geofences.list(query.objectId);
    return { count: geofences.length, geofences };
  }

  @Get('geofences/:userId/check')
  @ApiParam({ name: 'userId', description: 'ID сотрудника (UUID)' })
  @ApiOperation({
    summary: 'Проверка вхождения в геозону',
    description:
      'Ближайшая геозона в радиусе 1000 м: ST_Distance (метры, geography) и ST_Contains (внутри/вне).',
  })
  @ApiResponse({ status: 200, description: '{ inside, distanceMeters, geofence }' })
  async check(
    @Param('userId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) userId: string,
    @Query() query: GeofenceCheckQueryDto,
  ) {
    return this.geofences.check(userId, query.lat, query.lng);
  }

  @Get('employees/nearby')
  @ApiOperation({
    summary: 'Ближние сотрудники (последняя точка не старше 5 минут)',
    description:
      'Запрос устава п.4: DISTINCT ON (user_id) — последняя точка каждого сотрудника в радиусе. ' +
      'Используется SOS-вертикалью ticket-service (500 м).',
  })
  @ApiResponse({ status: 200, description: '{ count, employees: [{ userId, distanceMeters }] }' })
  async nearby(@Query() query: NearbyEmployeesQueryDto) {
    return this.gps.findNearbyEmployees(query.lat, query.lng, query.radius);
  }

  @Get('tracks')
  @ApiOperation({ summary: 'История перемещений сотрудника за период' })
  @ApiResponse({ status: 200, description: '{ userId, count, tracks }' })
  async tracks(@Query() query: TrackHistoryQueryDto) {
    return this.gps.history(query);
  }

  @Post('geofences')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Создать геозону объекта (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 201, description: 'Геозона создана' })
  @ApiResponse({ status: 403, description: 'Недостаточно прав' })
  async createGeofence(@Body() dto: CreateGeofenceDto) {
    return this.geofences.create(dto);
  }
}
