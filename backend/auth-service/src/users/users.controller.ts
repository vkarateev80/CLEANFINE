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
import type { Role } from '@cleaning-ops/shared/types/roles';
import { Roles } from '../auth/decorators/roles.decorator';
// DTO импортируются как ЗНАЧЕНИЯ: класс должен существовать в рантайме, иначе
// ValidationPipe с whitelist:true вырежет все поля тела (метатип = Object).
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { ListUsersQuery } from './users.service';
import { UsersService } from './users.service';

const ROLE_VALUES = ['OPERATOR', 'SUPERVISOR', 'ADMIN', 'CLIENT'] as const;

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('api/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Список сотрудников — ADMIN/SUPERVISOR (страница Employees в админке). */
  @Get()
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Список сотрудников (ADMIN, SUPERVISOR)' })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @ApiQuery({ name: 'take', required: false, type: Number, example: 50, description: 'максимум 100' })
  @ApiQuery({ name: 'role', required: false, enum: ROLE_VALUES })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'по ФИО, email или телефону' })
  @ApiResponse({ status: 200, description: 'Постраничный список: { items, total }' })
  @ApiResponse({ status: 401, description: 'Нет или невалидный access-токен' })
  @ApiResponse({ status: 403, description: 'Роль не ADMIN/SUPERVISOR' })
  async list(
    // DefaultValuePipe обязателен: `new ParseIntPipe({ optional: true })` в Nest 10
    // НЕ делает параметр опциональным — GET /api/users без query отвечал 400
    // «Validation failed (numeric string is expected)».
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
    @Query('role') role?: Role,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const query: ListUsersQuery = { skip, take, role, search };
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    return this.users.list(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  @ApiOperation({ summary: 'Сотрудник по id (ADMIN, SUPERVISOR)' })
  @ApiResponse({ status: 200, description: 'Публичные поля пользователя' })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  async getById(@Param('id') id: string) {
    return this.users.getById(id);
  }

  /** Создание сотрудника — только ADMIN. */
  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Создание сотрудника (только ADMIN)' })
  @ApiResponse({ status: 201, description: 'Сотрудник создан' })
  @ApiResponse({ status: 400, description: 'Ошибка валидации тела' })
  @ApiResponse({ status: 403, description: 'Роль не ADMIN' })
  @ApiResponse({ status: 409, description: 'Email или телефон уже заняты' })
  async register(@Body() dto: RegisterDto) {
    return this.users.register(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Изменение сотрудника (только ADMIN)' })
  @ApiResponse({ status: 200, description: 'Обновлённый пользователь' })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  @ApiResponse({ status: 409, description: 'Email или телефон уже заняты' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  /** Мягкая деактивация. */
  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Мягкая деактивация сотрудника (только ADMIN)',
    description: 'Пользователь не удаляется: ставится isActive=false и отзываются все refresh-токены.',
  })
  @ApiResponse({ status: 204, description: 'Сотрудник деактивирован' })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  async deactivate(@Param('id') id: string) {
    await this.users.update(id, { isActive: false });
  }
}
