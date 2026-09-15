import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class BiometricDto {
  @ApiProperty({
    description: 'Ключ устройства, привязанный к пользователю при первом входе',
    example: 'dev-biometric-operator',
  })
  @IsString()
  @IsNotEmpty()
  biometricKey!: string;
}
