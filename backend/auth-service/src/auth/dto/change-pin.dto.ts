import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ChangePinDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'PIN должен содержать 4–6 цифр' })
  newPin!: string;
}
