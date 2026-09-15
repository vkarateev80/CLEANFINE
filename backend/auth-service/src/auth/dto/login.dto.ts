import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Email пользователя', example: 'admin@cleaning-ops.com' })
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @ApiProperty({ description: 'Пароль (не короче 6 символов)', example: 'admin123', minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  password!: string;
}
