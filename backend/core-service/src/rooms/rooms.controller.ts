import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@ApiBearerAuth('access-token')
@Controller('api/floors/:floorId/rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Добавить помещение на этаж (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 201, description: 'Помещение создано' })
  @ApiResponse({ status: 400, description: 'Площадь ≤ 0 или координаты вне плана' })
  @ApiResponse({ status: 404, description: 'Этаж или техкарта не найдены' })
  async create(@Param('floorId') floorId: string, @Body() dto: CreateRoomDto) {
    return this.rooms.create(floorId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Помещения этажа (экспликация)' })
  async list(@Param('floorId') floorId: string) {
    return this.rooms.listByFloor(floorId);
  }
}

@ApiTags('rooms')
@ApiBearerAuth('access-token')
@Controller('api/rooms')
export class RoomItemController {
  constructor(private readonly rooms: RoomsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Помещение по id' })
  @ApiResponse({ status: 404, description: 'Помещение не найдено' })
  async getById(@Param('id') id: string) {
    return this.rooms.getById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({
    summary: 'Изменить помещение (ADMIN, SUPERVISOR)',
    description: 'techCardId: null отвязывает техкарту, отсутствие поля — не менять.',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Удалить помещение (только ADMIN)' })
  async remove(@Param('id') id: string) {
    await this.rooms.remove(id);
  }
}
