import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();

  // Реальный адрес клиента за прокси (12.10.2026). Сервис стоит за nginx пода
  // (и за traefik на k3s): без `trust proxy` `req.ip` — это адрес nginx, и лимит
  // «5 попыток входа в минуту на IP» становился общим на всех пользователей.
  // Число — сколько прокси между клиентом и сервисом (AUTH_TRUST_PROXY_HOPS):
  // 1 — только nginx (docker-compose стенд), 2 — traefik + nginx (k3s).
  // Express берёт адрес из X-Forwarded-For ровно на столько hop'ов, поэтому
  // подделанный клиентом заголовок за лишний hop не считается.
  const hops = app.get(ConfigService).get<number>('trustProxyHops') ?? 1;
  app.set('trust proxy', hops);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Swagger (приёмка М1.3: «Swagger документация»). В production скрыт:
  // схема API — внутренняя информация, наружу её не отдаём.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('CLEANFINE — Auth Service')
      .setDescription(
        'Аутентификация (JWT/PIN/биометрия) и RBAC. ' +
          'Access-токен передаётся заголовком `Authorization: Bearer <token>`.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('auth', 'Вход, обновление токенов, профиль')
      .addTag('users', 'Сотрудники (ADMIN/SUPERVISOR)')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);

  console.log(`auth-service запущен: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
