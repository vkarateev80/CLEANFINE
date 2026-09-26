import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  // Swagger скрыт в production (как в auth-service).
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Cleaning Ops — File Service')
      .setDescription(
        'Загрузка файлов в MinIO, водяные знаки (имя/дата/координаты), миниатюры, ' +
          'привязка к сущностям (планы этажей, заявки, чат, аватары).',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('files', 'Загрузка и метаданные файлов')
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(process.env.PORT) || 3002;
  await app.listen(port);
   
  console.log(`file-service запущен: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
     
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
