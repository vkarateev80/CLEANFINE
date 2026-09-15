import { ApiProperty } from '@nestjs/swagger';

/** Ответ эндпоинтов входа/обновления токенов. */
export class TokenPairDto {
  @ApiProperty({
    description: 'JWT access-токен',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'JWT refresh-токен (хранится в БД, ротируется при обновлении)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;
}
