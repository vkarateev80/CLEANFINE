import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ServiceTokenModule } from './auth/service-token.module';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import configuration from './config/configuration';
import { CoreModule } from './core/core.module';
import { EventsModule } from './events/events.module';
import { GpsModule } from './gps/gps.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { ScheduleModule } from './schedule/schedule.module';
import { TicketClientModule } from './tickets/ticket-client.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // backend/schedule-service → корень репозитория
      envFilePath: ['../../.env', '.env'],
      load: [configuration],
    }),
    PassportModule,
    PrismaModule,
    EventsModule,
    ServiceTokenModule,
    GpsModule,
    TicketClientModule,
    CoreModule,
    ScheduleModule,
    // М7.1: read-модели отчётов (SQL views + read-репозиторий).
    ReportsModule,
  ],
  providers: [
    JwtStrategy,
    // Глобально: JWT-защита (кроме @Public) + RBAC по @Roles
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
