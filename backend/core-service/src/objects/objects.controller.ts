import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateObjectDto, ListObjectsQueryDto, UpdateObjectDto } from './dto/object.dto';
import { ObjectsService } from './objects.service';

@ApiTags('objects')
@ApiBearerAuth('access-token')
@Controller('api/objects')
export class ObjectsController {
  constructor(private readonly objects: ObjectsService) {}

  @Post()
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Создать объект (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 201, description: 'Объект создан' })
  @ApiResponse({ status: 400, description: 'Ошибка валидации' })
  async create(@Body() dto: CreateObjectDto) {
    return this.objects.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Список объектов с фильтрами и пагинацией' })
  @ApiResponse({ status: 200, description: '{ items, total }' })
  async list(@Query() query: ListObjectsQueryDto) {
    return this.objects.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Объект по id' })
  @ApiResponse({ status: 404, description: 'Объект не найден' })
  async getById(@Param('id') id: string) {
    return this.objects.getById(id);
  }

  @Get(':id/detail')
  @ApiOperation({
    summary: 'Объект с этажами, помещениями и маршрутами',
    description: 'Используется карточкой объекта в админке.',
  })
  async getDetail(@Param('id') id: string) {
    return this.objects.getDetail(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Изменить объект (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 400, description: 'Недопустимый переход статуса' })
  async update(@Param('id') id: string, @Body() dto: UpdateObjectDto) {
    return this.objects.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Удалить объект (только ADMIN)',
    description: 'Каскадом удаляются этажи, помещения, маршруты и точки. Объект с активными маршрутами удалить нельзя.',
  })
  @ApiResponse({ status: 204, description: 'Объект удалён' })
  @ApiResponse({ status: 400, description: 'Есть активные маршруты' })
  async remove(@Param('id') id: string) {
    await this.objects.remove(id);
  }
}
