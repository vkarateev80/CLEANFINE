import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
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
