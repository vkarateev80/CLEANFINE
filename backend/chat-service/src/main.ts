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
      .setTitle('Cleaning Ops — Chat Service')
      .setDescription(
        'Чаты реального времени: object/ticket/direct/system, история сообщений, ' +
          'вложения, статус прочтения, поиск по тексту и push оффлайн-получателям ' +
          '(М5.1–М5.2). WebSocket — namespace /chat.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('chat', 'Чаты, история, поиск, отправка и прочтение')
      .addTag('health', 'Проверка живости сервиса')
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(process.env.CHAT_SERVICE_PORT ?? process.env.PORT) || 3009;
  await app.listen(port);

  console.log(`chat-service запущен: http://localhost:${port}/api`);

  console.log(`WebSocket: ws://localhost:${port}/chat (namespace chat)`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
