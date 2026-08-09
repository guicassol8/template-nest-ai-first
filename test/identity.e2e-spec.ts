import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { ZodType, z } from 'zod';
import { AppModule } from '../src/app.module';
import { AuthTokensSchema, UserSchema } from '../src/modules/identity/identity.contracts';
import { PrismaService } from '../src/platform/database/prisma.service';
import { ProblemDetailsSchema } from '../src/platform/http-errors/problem-details.contracts';
import { configureApiPrefix } from '../src/platform/openapi/openapi-document.factory';
import type { Environment } from '../src/platform/config/environment.contracts';

const buildUniqueEmail = (): string => `e2e-${randomUUID()}@example.com`;
const VALID_PASSWORD = 'senha-de-teste-123';
const PROBLEM_JSON = /application\/problem\+json/;

// supertest tipa `body` como any. Estreitar para unknown e parsear com o mesmo
// schema que a rota declara faz o E2E checar o contrato, não só o status.
const parseJsonBody = <TSchema extends ZodType>(
  schema: TSchema,
  response: { body: unknown },
): z.infer<TSchema> => schema.parse(response.body);

describe('identity (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let config: ConfigService<Environment, true>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Todos os requests desta suíte saem do mesmo IP e consumiriam a cota de
      // 5/min de register e login. O 429 tem arquivo próprio.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    configureApiPrefix(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    config = app.get(ConfigService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-' } } });
    await app.close();
  });

  it('percorre o fluxo completo de autenticação', async () => {
    const server = app.getHttpServer();
    const email = buildUniqueEmail();

    // register 201
    const registered = parseJsonBody(
      AuthTokensSchema,
      await request(server)
        .post('/v1/auth/register')
        .send({ email, password: VALID_PASSWORD })
        .expect(201),
    );
    expect(registered.expiresInSeconds).toBeGreaterThan(0);

    // login 200
    const loggedIn = parseJsonBody(
      AuthTokensSchema,
      await request(server)
        .post('/v1/auth/login')
        .send({ email, password: VALID_PASSWORD })
        .expect(200),
    );

    // me com token 200 — e o passwordHash não vaza (UserSchema não o tem, e o
    // ZodSerializerInterceptor corta o que não está no schema)
    const me = parseJsonBody(
      UserSchema,
      await request(server)
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${loggedIn.accessToken}`)
        .expect(200),
    );
    expect(me).toMatchObject({ email, role: 'user' });

    // me sem token 401
    await request(server).get('/v1/auth/me').expect(401).expect('Content-Type', PROBLEM_JSON);

    // me com token expirado 401 — não existe caminho pela API para obter um,
    // então assinamos com o JwtService e o segredo reais do app já construído.
    const expiredAccessToken = await jwtService.signAsync(
      { sub: me.id, role: me.role },
      { secret: config.get('JWT_ACCESS_SECRET', { infer: true }), expiresIn: '-1s' },
    );
    await request(server)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${expiredAccessToken}`)
      .expect(401);

    // refresh 200
    const rotated = parseJsonBody(
      AuthTokensSchema,
      await request(server)
        .post('/v1/auth/refresh')
        .send({ refreshToken: loggedIn.refreshToken })
        .expect(200),
    );
    expect(rotated.refreshToken).not.toBe(loggedIn.refreshToken);

    // reuso imediato do token antigo = retry de rede: cai na janela de graça,
    // recebe tokens novos e NÃO derruba a família. O kill fora da janela está
    // coberto em refresh-token.service.spec.ts — o e2e não espera 60s.
    const graced = parseJsonBody(
      AuthTokensSchema,
      await request(server)
        .post('/v1/auth/refresh')
        .send({ refreshToken: loggedIn.refreshToken })
        .expect(200),
    );
    expect(graced.refreshToken).not.toBe(loggedIn.refreshToken);

    // ...e o token rotacionado continua vivo: retry de graça não revoga ninguém
    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(200);

    // logout 204 — família nova, para o logout ter o que revogar
    const relogged = parseJsonBody(
      AuthTokensSchema,
      await request(server)
        .post('/v1/auth/login')
        .send({ email, password: VALID_PASSWORD })
        .expect(200),
    );
    await request(server)
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${relogged.accessToken}`)
      .send({ refreshToken: relogged.refreshToken })
      .expect(204);

    // refresh depois do logout 401
    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: relogged.refreshToken })
      .expect(401);

    // register com email repetido 409
    const conflict = parseJsonBody(
      ProblemDetailsSchema,
      await request(server)
        .post('/v1/auth/register')
        .send({ email, password: VALID_PASSWORD })
        .expect(409)
        .expect('Content-Type', PROBLEM_JSON),
    );
    expect(conflict.type).toContain('email-already-registered');
    expect(conflict.instance).toBeDefined();
  });

  it('não distingue email inexistente de senha errada no login', async () => {
    const server = app.getHttpServer();
    const email = buildUniqueEmail();
    await request(server)
      .post('/v1/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);

    const wrongPassword = parseJsonBody(
      ProblemDetailsSchema,
      await request(server)
        .post('/v1/auth/login')
        .send({ email, password: 'senha-errada-mesmo' })
        .expect(401),
    );
    const unknownEmail = parseJsonBody(
      ProblemDetailsSchema,
      await request(server)
        .post('/v1/auth/login')
        .send({ email: buildUniqueEmail(), password: VALID_PASSWORD })
        .expect(401),
    );

    expect(wrongPassword.title).toBe(unknownEmail.title);
    expect(wrongPassword.type).toBe(unknownEmail.type);
  });

  it('rejeita payload que não bate com o contrato', async () => {
    const invalid = parseJsonBody(
      ProblemDetailsSchema,
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'nao-e-email', password: 'curta' })
        .expect(400),
    );

    expect(invalid.type).toContain('validation-failed');
    expect(invalid.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'email' })]),
    );
  });

  it('serve /health sem autenticação, com o guard global ativo', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });
});
