import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { ZodSerializerInterceptor, createZodValidationPipe } from 'nestjs-zod';
import { validateEnvironment } from './platform/config/environment.contracts';
import { DatabaseModule } from './platform/database/database.module';
import { HttpProblemDetailsFilter } from './platform/http-errors/http-problem-details.filter';
import { LoggingModule } from './platform/observability/logging.module';
import { HealthController } from './platform/observability/health.controller';

// strictSchemaDeclaration lança ZodSchemaDeclarationException quando um
// parâmetro de rota não está tipado com DTO nestjs-zod. Os handlers do
// health.controller não recebem parâmetro, então não são afetados.
export const StrictZodValidationPipe = createZodValidationPipe({
  strictSchemaDeclaration: true,
});

@Module({
  imports: [
    ConfigModule.forRoot({ validate: validateEnvironment, isGlobal: true }),
    LoggingModule,
    DatabaseModule,
    TerminusModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useClass: StrictZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: HttpProblemDetailsFilter },
  ],
})
export class AppModule {}
