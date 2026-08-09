import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { Environment } from './platform/config/environment.contracts';
import {
  buildOpenApiDocument,
  configureApiPrefix,
} from './platform/openapi/openapi-document.factory';

// A ordem importa: bufferLogs guarda os logs do boot até o pino assumir, e o
// helmet precisa entrar antes de qualquer rota ser resolvida.
const bootstrapApplication = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // Sem isto onModuleDestroy nunca roda e, com o node como PID 1 no container,
  // SIGTERM é ignorado — todo deploy terminaria em SIGKILL sem drenar requests.
  app.enableShutdownHooks();
  app.use(helmet());

  const config = app.get<ConfigService<Environment, true>>(ConfigService);

  const trustProxyHops = config.get('TRUST_PROXY_HOPS', { infer: true });
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }
  app.enableCors({
    origin: config
      .get('CORS_ALLOWED_ORIGINS', { infer: true })
      .split(',')
      .filter(Boolean),
    credentials: false,
  });

  configureApiPrefix(app);
  // Swagger UI é ferramenta de desenvolvimento. Em produção a superfície
  // pública é o openapi.json commitado — não uma UI navegável no host da API.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
  }

  await app.listen(config.get('PORT', { infer: true }));
};

void bootstrapApplication();
