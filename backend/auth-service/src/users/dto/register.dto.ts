import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import type { Role } from '@cleaning-ops/shared/types/roles';

// Значения совпадают с shared/types/roles.ts (ROLES). Runtime-значение shared
// подключается после сборки shared (М2/М3); пока — литерал.
const ROLE_VALUES = ['OPERATOR', 'SUPERVISOR', 'ADMIN', 'CLIENT'] as const;

export class RegisterDto {
  @ApiProperty({ description: 'Email нового сотрудника', example: 'new.operator@cleaning-ops.com' })
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @ApiPropertyOptional({ description: 'Телефон', example: '+79990000005' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,15}$/, { message: 'Некорректный телефон' })
  phone?: string;

  @ApiProperty({
    description: 'Пароль (не короче 6 символов)',
    example: 'operator123',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  password!: string;

  @ApiProperty({ description: 'ФИО', example: 'Иванов Иван' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите ФИО' })
  fullName!: string;

  @ApiPropertyOptional({
    description: 'Роль (по умолчанию OPERATOR)',
    enum: ROLE_VALUES,
    example: 'OPERATOR',
  })
  @IsOptional()
  @IsIn(ROLE_VALUES, { message: 'Недопустимая роль' })
  role?: Role;
}
