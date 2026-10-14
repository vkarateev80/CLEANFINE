import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  DefaultValuePipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Bucket, EntityType } from '@prisma/client';
import { MAX_FILE_SIZE_BYTES } from '../config/configuration';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import { AttachFileDto, ENTITY_TYPES, UploadMetadataDto } from './dto/upload-metadata.dto';
import { FilesService } from './files.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('files')
@Controller('api/files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly storage: StorageService,
  ) {}

  @Post('upload')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Загрузка файла',
    description:
      'Поле `file` + метаданные. Для `kind=photo` накладывается водяной знак (имя, дата, координаты), ' +
      'генерируется миниатюра и проверяется разрешение ≥1280×720. `kind=chat` — вложения переписки ' +
      '(фото/видео/PDF без водяного знака). Лимит размера — 50 МБ.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'kind'],
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: ['photo', 'plan', 'avatar', 'document', 'chat'] },
        userName: { type: 'string', example: 'Иванов Иван' },
        takenAt: { type: 'string', example: '2026-09-14T18:00:00.000Z' },
        lat: { type: 'number', example: 55.7558 },
        lng: { type: 'number', example: 37.6173 },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Метаданные файла: url, thumbnailUrl, размеры' })
  @ApiResponse({ status: 400, description: 'Нет файла, недопустимый тип, размер или разрешение' })
  @ApiResponse({ status: 401, description: 'Нет или невалидный access-токен' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMetadataDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.files.upload(file, dto, { id: user.id, fullName: user.fullName });
  }

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Список файлов (фильтры по бакету, привязке, автору)' })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @ApiQuery({ name: 'take', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'bucket', required: false, enum: ['PHOTOS', 'PLANS', 'AVATARS', 'DOCUMENTS'] })
  @ApiQuery({ name: 'entityType', required: false, enum: ENTITY_TYPES })
  @ApiQuery({ name: 'entityId', required: false, type: String })
  @ApiQuery({ name: 'uploadedById', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Постраничный список: { items, total }' })
  async list(
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
    @Query('bucket') bucket?: Bucket,
    @Query('entityType') entityType?: EntityType,
    @Query('entityId') entityId?: string,
    @Query('uploadedById') uploadedById?: string,
  ) {
    return this.files.list({ skip, take, bucket, entityType, entityId, uploadedById });
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Метаданные файла по id' })
  @ApiResponse({ status: 200, description: 'Файл найден' })
  @ApiResponse({ status: 404, description: 'Файл не найден' })
  async getById(@Param('id') id: string) {
    return this.files.getById(id);
  }

  @Post(':id/attach')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Привязать файл к сущности (план этажа, заявка, сообщение чата, аватар)',
    description: 'Кросс-сервисная привязка по UUID: FK между сервисами не ставим.',
  })
  @ApiResponse({ status: 201, description: 'Идентификатор привязки' })
  @ApiResponse({ status: 404, description: 'Файл не найден' })
  async attach(@Param('id') id: string, @Body() dto: AttachFileDto) {
    return this.files.attach(id, dto);
  }

  @Get('attachments/:entityType/:entityId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Вложения сущности (в порядке добавления)' })
  @ApiResponse({ status: 200, description: 'Список файлов' })
  async listAttachments(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.files.listAttachments(entityType, entityId);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN', 'SUPERVISOR', 'MANAGER')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Удалить файл (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 204, description: 'Файл и его объекты в MinIO удалены' })
  @ApiResponse({ status: 403, description: 'Роль не ADMIN/SUPERVISOR' })
  @ApiResponse({ status: 404, description: 'Файл не найден' })
  async remove(@Param('id') id: string) {
    await this.files.remove(id);
  }

  @Public()
  @Get('health/ping')
  @ApiOperation({ summary: 'Проверка доступности сервиса и MinIO' })
  @ApiResponse({ status: 200, description: '{ status, minio }' })
  async health() {
    return { status: 'ok', minio: (await this.storage.ping()) ? 'ok' : 'unavailable' };
  }
}
