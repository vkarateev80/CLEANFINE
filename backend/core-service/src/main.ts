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

  // Swagger скрыт в production (как в auth/file-service).
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Cleaning Ops — Core Service')
      .setDescription(
        'Ядро домена: объекты → этажи → помещения, маршруты уборки с точками, ' +
          'техкарты с операциями и расходом материалов.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('objects', 'Объекты обслуживания')
      .addTag('floors', 'Этажи и планы')
      .addTag('rooms', 'Экспликация помещений')
      .addTag('routes', 'Маршруты и точки')
      .addTag('tech-cards', 'Техкарты и операции')
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(process.env.PORT) || 3003;
  await app.listen(port);
   
  console.log(`core-service запущен: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
     
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
