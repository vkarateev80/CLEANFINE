import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  // Swagger скрыт в production (как в auth/file/core/ticket).
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Cleaning Ops — Schedule Service')
      .setDescription(
        'Графики и смены: рекуррентные расписания (daily/weekly/monthly), генерация смен ' +
          'с автосозданием плановых заявок в ticket-service, check-in/check-out с проверкой ' +
          'геозоны (gps-service), контроль неявок и авто check-out (М4.4–М4.5).',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('schedule', 'Графики, смены, check-in/check-out, генерация и неявки')
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Порт фиксирован в .env (SCHEDULE_SERVICE_PORT=3008); PORT — общий фолбэк.
  const port = Number(process.env.SCHEDULE_SERVICE_PORT ?? process.env.PORT) || 3008;
  await app.listen(port);
   
  console.log(`schedule-service запущен: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
     
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }

  // ConfigService здесь, чтобы конфигурация точно была провалидирована на старте.
  const schedule = app.get(ConfigService).get('schedule');
   
  console.log(
    `Проходы: неявки/авто check-out каждые ${schedule?.missedCheckinIntervalMs} мс, ` +
      `авто check-out через ${schedule?.autoCheckoutMinutes} мин, ` +
      `генерация каждые ${schedule?.generateIntervalMs} мс в ${schedule?.generateHourUtc}:00 UTC, ` +
      `cron ${schedule?.cronEnabled ? 'включён' : 'выключен'}`,
  );
}

void bootstrap();
