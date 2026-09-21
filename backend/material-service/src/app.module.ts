import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { AmqpModule } from './amqp/amqp.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import configuration from './config/configuration';
import { MaterialConsumptionModule } from './consumption/material-consumption.module';
import { IntegrationModule } from './integration/integration.module';
import { MaterialsModule } from './materials/materials.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // backend/material-service → корень репозитория
      envFilePath: ['../../.env', '.env'],
      load: [configuration],
    }),
    PassportModule,
    PrismaModule,
    AmqpModule,
    IntegrationModule,
    MaterialsModule,
    MaterialConsumptionModule,
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
