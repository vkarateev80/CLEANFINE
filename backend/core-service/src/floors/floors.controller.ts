import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccessToken } from '../auth/decorators/access-token.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AttachPlanDto, CreateFloorDto, UpdateFloorDto } from './dto/floor.dto';
import { FloorsService } from './floors.service';

/** Лимит плана: 10 МБ, как в file-service. */
const MAX_PLAN_BYTES = 10 * 1024 * 1024;

@ApiTags('floors')
@ApiBearerAuth('access-token')
@Controller('api/objects/:objectId/floors')
export class FloorsController {
  constructor(private readonly floors: FloorsService) {}

  @Post()
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER')
  @ApiOperation({ summary: 'Добавить этаж объекту (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 201, description: 'Этаж создан' })
  @ApiResponse({ status: 404, description: 'Объект не найден' })
  @ApiResponse({ status: 409, description: 'Этаж с таким номером уже есть' })
  async create(@Param('objectId') objectId: string, @Body() dto: CreateFloorDto) {
    return this.floors.create(objectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Этажи объекта (по возрастанию номера)' })
  async list(@Param('objectId') objectId: string) {
    return this.floors.listByObject(objectId);
  }
}

@ApiTags('floors')
@ApiBearerAuth('access-token')
@Controller('api/floors')
export class FloorItemController {
  constructor(private readonly floors: FloorsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Этаж по id' })
  @ApiResponse({ status: 404, description: 'Этаж не найден' })
  async getById(@Param('id') id: string) {
    return this.floors.getById(id);
  }

  @Get(':id/detail')
  @ApiOperation({ summary: 'Этаж с помещениями и маршрутами (для экрана плана)' })
  async getDetail(@Param('id') id: string) {
    return this.floors.getDetail(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER')
  @ApiOperation({ summary: 'Изменить этаж (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 409, description: 'Этаж с таким номером уже есть' })
  async update(@Param('id') id: string, @Body() dto: UpdateFloorDto) {
    return this.floors.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Удалить этаж (только ADMIN), каскадом помещения и маршруты' })
  async remove(@Param('id') id: string) {
    await this.floors.remove(id);
  }

  @Post(':id/plan')
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Загрузить план этажа (ADMIN, SUPERVISOR)',
    description:
      'Файл (PNG/JPG/PDF/SVG, ≤10 МБ) уходит в file-service (bucket plans) от имени текущего ' +
      'пользователя; в core сохраняются URL и масштаб.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        planScale: { type: 'number', example: 0.05 },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Этаж с заполненным planImageUrl' })
  @ApiResponse({ status: 400, description: 'Файл не передан или отклонён file-service' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PLAN_BYTES } }))
  async uploadPlan(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @AccessToken() token: string,
    @Body('planScale') planScale?: string,
  ) {
    return this.floors.uploadPlan(id, file, token, parseScale(planScale));
  }

  @Post(':id/plan-url')
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER')
  @ApiOperation({
    summary: 'Привязать уже загруженный план по URL (ADMIN, SUPERVISOR)',
    description: 'Альтернатива multipart-загрузке: файл уже лежит в file-service.',
  })
  async attachPlan(@Param('id') id: string, @Body() dto: AttachPlanDto) {
    return this.floors.attachPlan(id, dto);
  }
}

function parseScale(value?: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException(`planScale: ожидается положительное число, получено «${value}»`);
  }
  return parsed;
}
