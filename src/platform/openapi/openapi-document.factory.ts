import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { z } from 'zod';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { ProblemDetailsDto } from '../http-errors/problem-details.contracts';

// Título e versão vêm do manifesto: o "API"/"1.0" hardcoded era o placeholder
// que todo template esquece de trocar. Lido do cwd porque o processo sempre
// sobe da raiz do projeto — local, CI e Docker (WORKDIR /app).
const PackageManifestSchema = z.object({ name: z.string(), version: z.string() });

const readPackageManifest = (): z.infer<typeof PackageManifestSchema> =>
  PackageManifestSchema.parse(
    JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')),
  );

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

export const buildOpenApiDocument = (app: INestApplication): OpenAPIObject => {
  const manifest = readPackageManifest();
  return cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(manifest.name)
        .setVersion(manifest.version)
        .addBearerAuth()
        .build(),
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
};
