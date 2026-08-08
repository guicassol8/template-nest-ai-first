import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Environment } from '../config/environment.contracts';

// Propaga o x-request-id que o cliente mandou, ou cria um. O filter de problem
// details lê o mesmo valor no campo `instance` — é o que o suporte pede ao usuário.
const generateRequestId = (
  request: IncomingMessage,
  response: ServerResponse,
): string => {
  const received = request.headers['x-request-id'];
  const requestId = typeof received === 'string' ? received : randomUUID();
  response.setHeader('x-request-id', requestId);
  return requestId;
};

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: generateRequestId,
          redact: [
            'req.headers.authorization',
            'password',
            'refreshToken',
            'accessToken',
            'token',
            'tokenHash',
          ],
          ...(config.get('NODE_ENV', { infer: true }) === 'development'
            ? { transport: { target: 'pino-pretty' } }
            : {}),
        },
      }),
    }),
  ],
})
export class LoggingModule {}
