import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Новый пароль сотрудника, назначаемый администратором (14.10.2026).
 * Текущий пароль не нужен — это не самообслуживание (`/auth/change-password`),
 * а сброс по запросу сотрудника; правила длины те же, что при создании.
 */
export class SetPasswordDto {
  @ApiProperty({
    description: 'Новый пароль (не короче 6 символов)',
    example: 'new-pass-123',
    minLength: 6,
    maxLength: 128,
  })
  @IsString({ message: 'Укажите пароль' })
  @IsNotEmpty({ message: 'Укажите пароль' })
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  @MaxLength(128, { message: 'Пароль не длиннее 128 символов' })
  password!: string;
}
