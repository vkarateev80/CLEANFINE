import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  // Swagger скрыт в production (как в core/ticket/auth/file-service).
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Cleaning Ops — Material Service')
      .setDescription(
        'Материалы и склады: справочник, остатки по объектам, движения ' +
          '(приход/расход/перемещение/списание), автосписание по завершению операций ' +
          'техкарты, пороги и отчёт по расходу (М4.1–М4.2).',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('materials', 'Справочник материалов, остатки, движения, отчёт')
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(process.env.MATERIAL_SERVICE_PORT ?? process.env.PORT) || 3007;
  await app.listen(port);

  console.log(`material-service запущен: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
