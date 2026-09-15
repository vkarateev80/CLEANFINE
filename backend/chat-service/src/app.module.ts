import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { ChatsModule } from './chats/chats.module';
import configuration from './config/configuration';
import { HealthModule } from './health/health.module';
import { IntegrationModule } from './integration/integration.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // backend/chat-service → корень репозитория
      envFilePath: ['../../.env', '.env'],
      load: [configuration],
    }),
    PassportModule,
    PrismaModule,
    IntegrationModule,
    ChatsModule,
    HealthModule,
  ],
  providers: [
    JwtStrategy,
    // Глобально: JWT-защита (кроме @Public) + RBAC по @Roles.
    // WebSocket-соединения проходят отдельную проверку handshake в ChatGateway.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
