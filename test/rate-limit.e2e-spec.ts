import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/database/prisma.service';
import { ProblemDetailsSchema } from '../src/platform/http-errors/problem-details.contracts';
import { configureApiPrefix } from '../src/platform/openapi/openapi-document.factory';

// Arquivo separado porque aqui o ThrottlerGuard NÃO é sobrescrito. Com
// fileParallelism: false os dois arquivos não competem pela mesma cota de IP.
describe('rate limit (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApiPrefix(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'ratelimit-' } } });
    await app.close();
  });

  it('devolve 429 no 6º login dentro do mesmo minuto', async () => {
    const server = app.getHttpServer();
    const email = `ratelimit-${randomUUID()}@example.com`;

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(server)
        .post('/v1/auth/login')
        .send({ email, password: 'senha-qualquer-123' });
      statuses.push(response.status);
    }

    // Os 5 primeiros passam pelo throttler e falham por credencial (401).
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);

    const throttled = await request(server)
      .post('/v1/auth/login')
      .send({ email, password: 'senha-qualquer-123' })
      .expect(429)
      .expect('Content-Type', /application\/problem\+json/);

    expect(ProblemDetailsSchema.parse(throttled.body).type).toContain(
      'rate-limit-exceeded',
    );
  });
});
