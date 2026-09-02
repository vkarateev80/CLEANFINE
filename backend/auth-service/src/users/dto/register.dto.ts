import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import type { Role } from '@cleaning-ops/shared/types/roles';

// Значения совпадают с shared/types/roles.ts (ROLES). Runtime-значение shared
// подключается после сборки shared (М2/М3); пока — литерал.
const ROLE_VALUES = ['OPERATOR', 'SUPERVISOR', 'ADMIN', 'CLIENT'] as const;

export class RegisterDto {
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,15}$/, { message: 'Некорректный телефон' })
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите ФИО' })
  fullName!: string;

  @IsOptional()
  @IsIn(ROLE_VALUES, { message: 'Недопустимая роль' })
  role?: Role;
}
