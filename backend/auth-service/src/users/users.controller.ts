import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Role } from '@cleaning-ops/shared/types/roles';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RegisterDto } from './dto/register.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { ListUsersQuery } from './users.service';
import { UsersService } from './users.service';

@Controller('api/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Список сотрудников — ADMIN/SUPERVISOR (страница Employees в админке). */
  @Get()
  @Roles('ADMIN', 'SUPERVISOR')
  async list(
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
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
  async getById(@Param('id') id: string) {
    return this.users.getById(id);
  }

  /** Создание сотрудника — только ADMIN. */
  @Post()
  @Roles('ADMIN')
  async register(@Body() dto: RegisterDto) {
    return this.users.register(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  /** Мягкая деактивация. */
  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  async deactivate(@Param('id') id: string) {
    await this.users.update(id, { isActive: false });
  }
}
