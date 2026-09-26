import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Регистрация биометрического ключа устройства (М6, после первого входа). */
export class RegisterBiometricDto {
  @ApiProperty({
    description: 'Ключ устройства: строка, которую приложение сохраняет после первого входа',
    example: 'dev-biometric-operator',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  biometricKey!: string;
}
