import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { Role } from '@cleaning-ops/shared/types/roles';

// Значения совпадают с shared/types/roles.ts (ROLES).
const ROLE_VALUES = ['OPERATOR', 'SUPERVISOR', 'ADMIN', 'CLIENT'] as const;

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Новый email', example: 'operator2@cleaning-ops.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Некорректный email' })
  email?: string;

  @ApiPropertyOptional({ description: 'Телефон', example: '+79990000006' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,15}$/, { message: 'Некорректный телефон' })
  phone?: string;

  @ApiPropertyOptional({ description: 'ФИО', example: 'Петров Пётр' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ description: 'Роль', enum: ROLE_VALUES, example: 'SUPERVISOR' })
  @IsOptional()
  @IsIn(ROLE_VALUES, { message: 'Недопустимая роль' })
  role?: Role;

  @ApiPropertyOptional({
    description: 'Активен ли сотрудник (false — мягкая деактивация)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'URL аватара', example: 'https://cdn/avatar.png' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
