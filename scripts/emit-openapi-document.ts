import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import {
  buildOpenApiDocument,
  configureApiPrefix,
} from '../src/platform/openapi/openapi-document.factory';

// Cria a aplicação sem `listen`: só precisamos do grafo de rotas para montar o
// documento. Mesma função que o main.ts usa, então /docs e openapi.json nunca
// divergem.
const emitOpenApiDocument = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApiPrefix(app);
  await app.init();

  const document = buildOpenApiDocument(app);
  const outputPath = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();
  console.log(`openapi.json escrito em ${outputPath}`);
};

void emitOpenApiDocument();
