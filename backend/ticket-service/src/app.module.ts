import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import configuration from './config/configuration';
import { EventsModule } from './events/events.module';
import { GpsModule } from './gps/gps.module';
import { PrismaModule } from './prisma/prisma.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // backend/ticket-service → корень репозитория
      envFilePath: ['../../.env', '.env'],
      load: [configuration],
    }),
    PassportModule,
    PrismaModule,
    EventsModule,
    GpsModule,
    TicketsModule,
  ],
  providers: [
    JwtStrategy,
    // Глобально: JWT-защита (кроме @Public) + RBAC по @Roles
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
