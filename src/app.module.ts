import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodSerializerInterceptor, createZodValidationPipe } from 'nestjs-zod';
import { AuthModule } from './platform/auth/auth.module';
import { JwtAuthGuard } from './platform/auth/jwt-auth.guard';
import { RolesGuard } from './platform/auth/roles.guard';
import { validateEnvironment } from './platform/config/environment.contracts';
import { DatabaseModule } from './platform/database/database.module';
import { HttpProblemDetailsFilter } from './platform/http-errors/http-problem-details.filter';
import { IdentityModule } from './modules/identity/identity.module';
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
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    LoggingModule,
    DatabaseModule,
    AuthModule, // @Global() — os guards abaixo dependem dele
    IdentityModule,
    TerminusModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useClass: StrictZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: HttpProblemDetailsFilter },
    // A ORDEM É SIGNIFICATIVA. Nest executa guards globais na ordem de
    // registro, e RolesGuard lê o request.authenticatedUser que o JwtAuthGuard
    // escreve. Inverter faz toda rota com @RequireRoles estourar undefined.
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // 1º
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // 2º
    { provide: APP_GUARD, useClass: RolesGuard }, // 3º
  ],
})
export class AppModule {}
