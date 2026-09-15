import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Текущий пароль (подтверждение операции)', example: 'admin123' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({
    description: 'Новый пароль (не короче 6 символов)',
    example: 'new-admin-123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: 'Новый пароль должен быть не короче 6 символов' })
  newPassword!: string;
}
