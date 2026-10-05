import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DEFAULT_PORT } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  // Swagger скрыт в production (как в core/auth/file).
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('CLEANFINE — Notification Service')
      .setDescription(
        'Уведомления: устройства и push-токены, in-app список, настройки подписок, ' +
          'шаблоны и RabbitMQ-консьюмер событий оперативки.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('notifications', 'Устройства, in-app уведомления, настройки подписок')
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Порт берём из конфига: он читает NOTIFICATION_SERVICE_PORT (fallback PORT → 3006).
  const port = app.get(ConfigService).get<number>('port') ?? DEFAULT_PORT;
  await app.listen(port);

  console.log(`notification-service запущен: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
