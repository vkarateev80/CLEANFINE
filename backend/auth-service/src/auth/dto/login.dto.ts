import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Логин: email или короткое имя (admin, operator, client)',
    example: 'admin',
  })
  @IsString({ message: 'Укажите логин' })
  @IsNotEmpty({ message: 'Укажите логин' })
  // Без @IsEmail: демо-учётки — короткие имена (admin/operator/client).
  // Формат-проверка «найдёт ли пользователься» — валидность на сервере: 401.
  @MaxLength(254, { message: 'Логин не длиннее 254 символов' })
  email!: string;

  @ApiProperty({ description: 'Пароль (не короче 6 символов)', example: 'admin123', minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  password!: string;
}
