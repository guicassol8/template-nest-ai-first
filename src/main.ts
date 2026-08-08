import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Environment } from './platform/config/environment.contracts';
import {
  buildOpenApiDocument,
  configureApiPrefix,
} from './platform/openapi/openapi-document.factory';

// A ordem importa: bufferLogs guarda os logs do boot até o pino assumir, e o
// helmet precisa entrar antes de qualquer rota ser resolvida.
const bootstrapApplication = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());

  const config = app.get<ConfigService<Environment, true>>(ConfigService);
  app.enableCors({
    origin: config
      .get('CORS_ALLOWED_ORIGINS', { infer: true })
      .split(',')
      .filter(Boolean),
    credentials: false,
  });

  configureApiPrefix(app);
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app));

  await app.listen(config.get('PORT', { infer: true }));
};

void bootstrapApplication();
