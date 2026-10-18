import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateScheduleSettingsDto {
  @ApiProperty({
    description: 'Часовой пояс расписания, IANA-имя (список для выбора — SCHEDULE_TIME_ZONES в shared)',
    example: 'Europe/Moscow',
  })
  @IsString()
  @IsNotEmpty({ message: 'Укажите часовой пояс' })
  @MaxLength(64)
  timeZone!: string;
}
