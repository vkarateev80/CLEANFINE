import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class PinLoginDto {
  @ApiPropertyOptional({
    description: 'Email пользователя (нужен email или телефон)',
    example: 'operator',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Телефон пользователя', example: '+79990000003' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'PIN из 4–6 цифр', example: '3456', minLength: 4, maxLength: 6 })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,6}$/, { message: 'PIN должен содержать 4–6 цифр' })
  pinCode!: string;
}
