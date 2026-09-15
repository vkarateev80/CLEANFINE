import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ChangePinDto {
  @ApiProperty({ description: 'Текущий пароль (подтверждение операции)', example: 'admin123' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ description: 'Новый PIN из 4–6 цифр', example: '9876', minLength: 4, maxLength: 6 })
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'PIN должен содержать 4–6 цифр' })
  newPin!: string;
}
