import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { Role } from '@cleaning-ops/shared/types/roles';

// Значения совпадают с shared/types/roles.ts (ROLES).
const ROLE_VALUES = ['OPERATOR', 'SUPERVISOR', 'ADMIN', 'CLIENT'] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: 'Некорректный email' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,15}$/, { message: 'Некорректный телефон' })
  phone?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsIn(ROLE_VALUES, { message: 'Недопустимая роль' })
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
