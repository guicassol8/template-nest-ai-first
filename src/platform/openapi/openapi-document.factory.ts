import { RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { ProblemDetailsDto } from '../http-errors/problem-details.contracts';

// Prefixo e documento moram no mesmo arquivo porque são a mesma coisa: o
// formato da superfície pública. main.ts e scripts/emit-openapi-document.ts
// chamam as duas funções, nesta ordem — se só o main.ts aplicasse o prefixo, o
// openapi.json commitado sairia sem /v1 e mentiria sobre a API servida (P4).
export const configureApiPrefix = (app: INestApplication): void => {
  app.setGlobalPrefix('v1', {
    // Health fora do /v1: probe de load balancer não muda quando a API virar v2.
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
};

export const buildOpenApiDocument = (app: INestApplication): OpenAPIObject =>
  cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('API').setVersion('1.0').addBearerAuth().build(),
      {
        // Sem isto o SDK gerado sai com authControllerLogin() em vez de login().
        operationIdFactory: (_controllerKey, methodKey) => methodKey,
        // ProblemDetails é contrato mesmo quando nenhuma rota o referencia
        // diretamente: o cliente decide o comportamento pelo `type` do erro.
        extraModels: [ProblemDetailsDto],
      },
    ),
    // 3.0 até confirmar que o gerador de client do app lida com const/anyOf de 3.1.
    { version: '3.0' },
  );
