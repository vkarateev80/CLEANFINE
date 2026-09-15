import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { LOGIN_THROTTLE_NAME } from './auth/auth.controller';
import configuration, {
  DEFAULT_GLOBAL_THROTTLE_LIMIT,
  DEFAULT_LOGIN_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_MS,
  positiveInt,
} from './config/configuration';
import { validateEnv } from './config/validation';
import { PrismaModule } from './prisma/prisma.module';
import { TokensModule } from './tokens/tokens.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // backend/auth-service → корень репозитория
      envFilePath: ['../../.env', '.env'],
      load: [configuration],
      // Без этой строки проверка окружения не выполнялась: функция была мёртвым кодом,
      // и в prod сервис стартовал на публичном 'dev-access-secret'.
      validate: validateEnv,
    }),
    // Глобальный лимит (по умолчанию 100 запросов/мин); login дополнительно
    // ограничен (по умолчанию 5/мин, см. AuthController). Оба значения настраиваются
    // через env, чтобы e2e-набор не упирался в rate limit.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = positiveInt(String(config.get('throttle.ttlMs') ?? ''), DEFAULT_THROTTLE_TTL_MS);
        return [
          // безымянный пресет = глобальный лимит (APP_GUARD)
          {
            ttl,
            limit: positiveInt(
              String(config.get('throttle.globalLimit') ?? ''),
              DEFAULT_GLOBAL_THROTTLE_LIMIT,
            ),
          },
          // именованный пресет для логина/PIN/биометрии (@Throttle в AuthController)
          {
            name: LOGIN_THROTTLE_NAME,
            ttl,
            limit: positiveInt(String(config.get('throttle.loginLimit') ?? ''), DEFAULT_LOGIN_THROTTLE_LIMIT),
          },
        ];
      },
    }),
    PrismaModule,
    TokensModule,
    AuthModule,
    UsersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
