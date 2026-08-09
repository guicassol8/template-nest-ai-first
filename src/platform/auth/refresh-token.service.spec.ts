import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { RefreshTokenClaimsSchema } from './authenticated-user.contracts';
import { PasswordHasherService } from './password-hasher.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenService } from './refresh-token.service';
import type { RefreshTokenClaims } from './authenticated-user.contracts';
import type {
  InsertRefreshTokenInput,
  RefreshTokenRecord,
} from './refresh-token.repository';

const REFRESH_SECRET = 'test-only-refresh-secret-0123456789abcdef';
const GRACE_SECONDS = 60;
const USER_ID = '11111111-1111-4111-8111-111111111111';
const FAMILY_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN_ID = '33333333-3333-4333-8333-333333333333';

const buildTestConfigService = (): ConfigService => {
  const values: Record<string, unknown> = {
    JWT_REFRESH_SECRET: REFRESH_SECRET,
    JWT_REFRESH_TTL_SECONDS: 2_592_000,
    JWT_REFRESH_REUSE_GRACE_SECONDS: GRACE_SECONDS,
  };
  return new ConfigService(values);
};

const buildRefreshTokenRecord = (
  overrides: Partial<RefreshTokenRecord>,
): RefreshTokenRecord => ({
  id: TOKEN_ID,
  userId: USER_ID,
  familyId: FAMILY_ID,
  tokenHash: 'hash-armazenado',
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
  ...overrides,
});

// Mocks por closure em vez de vi.fn: os arrays capturam os argumentos com tipo
// forte, sem `any` atravessando `mock.calls`.
const buildRefreshTokenService = async (overrides: {
  record?: RefreshTokenRecord | null;
  rotationSucceeds?: boolean;
  hashMatches?: boolean;
}): Promise<{
  refreshTokenService: RefreshTokenService;
  jwtService: JwtService;
  insertedTokens: InsertRefreshTokenInput[];
  rotatedTokens: InsertRefreshTokenInput[];
  deletedFamilies: string[];
  prunedUsers: string[];
}> => {
  const insertedTokens: InsertRefreshTokenInput[] = [];
  const rotatedTokens: InsertRefreshTokenInput[] = [];
  const deletedFamilies: string[] = [];
  const prunedUsers: string[] = [];

  const moduleRef = await Test.createTestingModule({
    imports: [JwtModule.register({})],
    providers: [
      RefreshTokenService,
      { provide: ConfigService, useValue: buildTestConfigService() },
      {
        provide: PasswordHasherService,
        useValue: {
          hashPassword: () => Promise.resolve('hash-novo'),
          verifyPassword: () => Promise.resolve(overrides.hashMatches ?? true),
        },
      },
      {
        provide: RefreshTokenRepository,
        useValue: {
          findRefreshTokenById: () => Promise.resolve(overrides.record ?? null),
          insertRefreshToken: (input: InsertRefreshTokenInput) => {
            insertedTokens.push(input);
            return Promise.resolve();
          },
          rotateRefreshToken: (
            _revokedTokenId: string,
            _revokedAt: Date,
            next: InsertRefreshTokenInput,
          ) => {
            rotatedTokens.push(next);
            return Promise.resolve(overrides.rotationSucceeds ?? true);
          },
          deleteTokenFamily: (familyId: string) => {
            deletedFamilies.push(familyId);
            return Promise.resolve();
          },
          deleteExpiredRefreshTokens: (userId: string) => {
            prunedUsers.push(userId);
            return Promise.resolve();
          },
        },
      },
    ],
  }).compile();

  return {
    refreshTokenService: moduleRef.get(RefreshTokenService),
    jwtService: moduleRef.get(JwtService),
    insertedTokens,
    rotatedTokens,
    deletedFamilies,
    prunedUsers,
  };
};

const signPresentedToken = (jwtService: JwtService): Promise<string> =>
  jwtService.signAsync(
    { sub: USER_ID, jti: TOKEN_ID, fam: FAMILY_ID },
    { secret: REFRESH_SECRET, expiresIn: 3_600 },
  );

const parseRefreshClaims = async (
  jwtService: JwtService,
  token: string,
): Promise<RefreshTokenClaims> => {
  const payload: unknown = await jwtService.verifyAsync(token, {
    secret: REFRESH_SECRET,
  });
  return RefreshTokenClaimsSchema.parse(payload);
};

describe('RefreshTokenService', () => {
  it('emite um token verificável e persiste o hash na família nova', async () => {
    const harness = await buildRefreshTokenService({});

    const token = await harness.refreshTokenService.issueRefreshToken(USER_ID);

    const claims = await parseRefreshClaims(harness.jwtService, token);
    expect(claims.sub).toBe(USER_ID);
    expect(harness.insertedTokens).toHaveLength(1);
    expect(harness.insertedTokens[0]?.id).toBe(claims.jti);
    expect(harness.insertedTokens[0]?.familyId).toBe(claims.fam);
    expect(harness.insertedTokens[0]?.tokenHash).toBe('hash-novo');
  });

  // Não há cron no projeto: a tabela só para de crescer porque o login limpa
  // os expirados do próprio usuário.
  it('descarta os tokens expirados do usuário ao abrir família nova', async () => {
    const harness = await buildRefreshTokenService({});

    await harness.refreshTokenService.issueRefreshToken(USER_ID);

    expect(harness.prunedUsers).toEqual([USER_ID]);
  });

  it('rotaciona token vivo e emite o sucessor na mesma família', async () => {
    const harness = await buildRefreshTokenService({
      record: buildRefreshTokenRecord({}),
    });
    const presented = await signPresentedToken(harness.jwtService);

    const rotated = await harness.refreshTokenService.rotateRefreshToken(presented);

    expect(rotated.userId).toBe(USER_ID);
    const claims = await parseRefreshClaims(harness.jwtService, rotated.refreshToken);
    expect(claims.fam).toBe(FAMILY_ID);
    expect(harness.rotatedTokens[0]?.id).toBe(claims.jti);
    expect(harness.deletedFamilies).toHaveLength(0);
  });

  // O app mandou o refresh, a resposta se perdeu na rede e ele reapresenta o
  // token antigo: deslogar aqui puniria o usuário pela rede ruim.
  it('trata reuso dentro da janela de graça como retry de rede', async () => {
    const harness = await buildRefreshTokenService({
      record: buildRefreshTokenRecord({ revokedAt: new Date(Date.now() - 5_000) }),
    });
    const presented = await signPresentedToken(harness.jwtService);

    const retried = await harness.refreshTokenService.rotateRefreshToken(presented);

    const claims = await parseRefreshClaims(harness.jwtService, retried.refreshToken);
    expect(claims.fam).toBe(FAMILY_ID);
    expect(harness.insertedTokens).toHaveLength(1);
    expect(harness.deletedFamilies).toHaveLength(0);
  });

  it('revoga a família inteira no reuso fora da janela de graça', async () => {
    const harness = await buildRefreshTokenService({
      record: buildRefreshTokenRecord({
        revokedAt: new Date(Date.now() - (GRACE_SECONDS + 60) * 1_000),
      }),
    });
    const presented = await signPresentedToken(harness.jwtService);

    await expect(
      harness.refreshTokenService.rotateRefreshToken(presented),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(harness.deletedFamilies).toEqual([FAMILY_ID]);
    expect(harness.insertedTokens).toHaveLength(0);
  });

  // Dois refreshes concorrentes com o mesmo token: o que perde o update
  // condicional acabou de ser ultrapassado — é retry por construção, não roubo.
  it('trata a derrota na corrida de rotação como retry, não roubo', async () => {
    const harness = await buildRefreshTokenService({
      record: buildRefreshTokenRecord({}),
      rotationSucceeds: false,
    });
    const presented = await signPresentedToken(harness.jwtService);

    const retried = await harness.refreshTokenService.rotateRefreshToken(presented);

    const claims = await parseRefreshClaims(harness.jwtService, retried.refreshToken);
    expect(claims.fam).toBe(FAMILY_ID);
    expect(harness.insertedTokens).toHaveLength(1);
    expect(harness.deletedFamilies).toHaveLength(0);
  });

  it('rejeita token cuja linha já expirou', async () => {
    const harness = await buildRefreshTokenService({
      record: buildRefreshTokenRecord({ expiresAt: new Date(Date.now() - 1_000) }),
    });
    const presented = await signPresentedToken(harness.jwtService);

    await expect(
      harness.refreshTokenService.rotateRefreshToken(presented),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita token cujo hash não confere com a linha', async () => {
    const harness = await buildRefreshTokenService({
      record: buildRefreshTokenRecord({}),
      hashMatches: false,
    });
    const presented = await signPresentedToken(harness.jwtService);

    await expect(
      harness.refreshTokenService.rotateRefreshToken(presented),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita token ilegível', async () => {
    const harness = await buildRefreshTokenService({});

    await expect(
      harness.refreshTokenService.rotateRefreshToken('nao-e-um-jwt'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revoga a família no logout com token conhecido', async () => {
    const harness = await buildRefreshTokenService({
      record: buildRefreshTokenRecord({}),
    });
    const presented = await signPresentedToken(harness.jwtService);

    await harness.refreshTokenService.revokeTokenFamily(presented);

    expect(harness.deletedFamilies).toEqual([FAMILY_ID]);
  });

  // Logout não é oráculo: token desconhecido responde igual ao conhecido.
  it('ignora logout com token desconhecido sem lançar', async () => {
    const harness = await buildRefreshTokenService({ record: null });
    const presented = await signPresentedToken(harness.jwtService);

    await expect(
      harness.refreshTokenService.revokeTokenFamily(presented),
    ).resolves.toBeUndefined();
    expect(harness.deletedFamilies).toHaveLength(0);
  });
});
