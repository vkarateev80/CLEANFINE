import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DEFAULT_PORT } from './config/constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  // Закрытие канала RabbitMQ при остановке процесса (грациозный shutdown).
  app.enableShutdownHooks();

  // Swagger скрыт в production (как в auth/core/file-service).
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Cleaning Ops — GPS Service')
      .setDescription(
        'Геопозиционирование: batch-приём треков (PostGIS), геозоны объектов, ' +
          'проверка вхождения, поиск ближних сотрудников, история перемещений.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('gps', 'GPS-треки, геозоны и поиск сотрудников')
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = app.get(ConfigService).get<number>('port') ?? DEFAULT_PORT;
  await app.listen(port);

  console.log(`gps-service запущен: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
