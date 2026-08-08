import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { validateEnvironment } from './platform/config/environment.contracts';
import { DatabaseModule } from './platform/database/database.module';
import { HttpProblemDetailsFilter } from './platform/http-errors/http-problem-details.filter';
import { LoggingModule } from './platform/observability/logging.module';
import { HealthController } from './platform/observability/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ validate: validateEnvironment, isGlobal: true }),
    LoggingModule,
    DatabaseModule,
    TerminusModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpProblemDetailsFilter }],
})
export class AppModule {}
