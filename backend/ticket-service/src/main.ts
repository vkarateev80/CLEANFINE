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

  // Swagger скрыт в production (как в auth/file/core).
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('CLEANFINE — Ticket Service')
      .setDescription(
        'Заявки: плановые, внеплановые и аварийные (SOS). State machine статусов, ' +
          'назначение исполнителей, комментарии, эскалация по дедлайнам и завершение ' +
          'операций техкарты (событие ticket.operation.completed).',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('tickets', 'Заявки, статусы, назначения, комментарии, операции техкарты')
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Порт фиксирован в .env (TICKET_SERVICE_PORT=3005); PORT — общий фолбэк.
  const port = Number(process.env.TICKET_SERVICE_PORT ?? process.env.PORT) || 3005;
  await app.listen(port);

  console.log(`ticket-service запущен: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }
  // ConfigService подключается здесь, чтобы конфигурация точно была провалидирована на старте.
  const escalation = app.get(ConfigService).get('escalation');

  console.log(
    `Эскалация: NEW→accept ${escalation?.newToAcceptMin} мин, accept→arrive ${escalation?.acceptToArriveMin} мин, ` +
      `arrive→done ${escalation?.arriveToDoneMin} мин, интервал ${escalation?.intervalMs} мс`,
  );
}

void bootstrap();
