import { IsNotEmpty, IsString } from 'class-validator';

export class BiometricDto {
  @IsString()
  @IsNotEmpty()
  biometricKey!: string;
}
