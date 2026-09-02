import { IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class PinLoginDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,6}$/, { message: 'PIN должен содержать 4–6 цифр' })
  pinCode!: string;
}
