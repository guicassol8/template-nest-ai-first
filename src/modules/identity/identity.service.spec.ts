import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AccessTokenService } from '../../platform/auth/access-token.service';
import { PasswordHasherService } from '../../platform/auth/password-hasher.service';
import { RefreshTokenService } from '../../platform/auth/refresh-token.service';
import { ProblemDetailsException } from '../../platform/http-errors/problem-details.contracts';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import type { UserRecord } from './identity.contracts';

const EXISTING_USER: UserRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'alice@example.com',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  passwordHash: 'hash-armazenado',
};

const buildIdentityService = async (overrides: {
  findUserByEmail?: UserRecord | null;
  insertUser?: UserRecord | null;
  passwordMatches?: boolean;
}): Promise<{
  identityService: IdentityService;
  wastePasswordVerification: ReturnType<typeof vi.fn>;
}> => {
  const wastePasswordVerification = vi.fn(() => Promise.resolve());
  const moduleRef = await Test.createTestingModule({
    providers: [
      IdentityService,
      {
        provide: IdentityRepository,
        useValue: {
          findUserByEmail: () => Promise.resolve(overrides.findUserByEmail ?? null),
          findUserById: () => Promise.resolve(overrides.findUserByEmail ?? null),
          insertUser: () => Promise.resolve(overrides.insertUser ?? null),
        },
      },
      {
        provide: PasswordHasherService,
        useValue: {
          hashPassword: () => Promise.resolve('hash-novo'),
          verifyPassword: () => Promise.resolve(overrides.passwordMatches ?? false),
          wastePasswordVerification,
        },
      },
      {
        provide: AccessTokenService,
        useValue: {
          signAccessToken: () => Promise.resolve('access-token'),
          getAccessTokenTtlSeconds: () => 900,
        },
      },
      {
        provide: RefreshTokenService,
        useValue: { issueRefreshToken: () => Promise.resolve('refresh-token') },
      },
    ],
  }).compile();

  return { identityService: moduleRef.get(IdentityService), wastePasswordVerification };
};

/** Sem `as`: estreita com instanceof e devolve só o que o teste precisa ler. */
const captureProblemDetails = async (
  operation: Promise<unknown>,
): Promise<{ status: number; problemType: string; message: string }> => {
  try {
    await operation;
  } catch (error: unknown) {
    if (error instanceof ProblemDetailsException) {
      return {
        status: error.getStatus(),
        problemType: error.problemType,
        message: error.message,
      };
    }
    throw error;
  }
  throw new Error('esperava um ProblemDetailsException, mas a operação passou');
};

describe('IdentityService', () => {
  describe('registerUser', () => {
    it('devolve o par de tokens quando o email é novo', async () => {
      const { identityService } = await buildIdentityService({
        insertUser: { ...EXISTING_USER, email: 'nova@example.com' },
      });

      await expect(
        identityService.registerUser({ email: 'nova@example.com', password: 'senha-boa-123' }),
      ).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresInSeconds: 900,
      });
    });

    it('responde 409 quando o email já existe', async () => {
      const { identityService } = await buildIdentityService({ insertUser: null });

      const problem = await captureProblemDetails(
        identityService.registerUser({
          email: 'alice@example.com',
          password: 'senha-boa-123',
        }),
      );

      expect(problem.status).toBe(409);
      expect(problem.problemType).toContain('email-already-registered');
    });
  });

  describe('loginUser', () => {
    it('autentica quando a senha bate', async () => {
      const { identityService } = await buildIdentityService({
        findUserByEmail: EXISTING_USER,
        passwordMatches: true,
      });

      await expect(
        identityService.loginUser({ email: EXISTING_USER.email, password: 'senha-certa' }),
      ).resolves.toMatchObject({ accessToken: 'access-token' });
    });

    it('recusa senha errada com 401', async () => {
      const { identityService } = await buildIdentityService({
        findUserByEmail: EXISTING_USER,
        passwordMatches: false,
      });

      await expect(
        identityService.loginUser({ email: EXISTING_USER.email, password: 'senha-errada' }),
      ).rejects.toBeInstanceOf(ProblemDetailsException);
    });

    // O email inexistente tem que gastar um argon2 antes de falhar; sem isso a
    // diferença de tempo entrega quais emails estão cadastrados.
    it('gasta um hash falso quando o email não existe', async () => {
      const { identityService, wastePasswordVerification } = await buildIdentityService({
        findUserByEmail: null,
      });

      await expect(
        identityService.loginUser({ email: 'ninguem@example.com', password: 'qualquer' }),
      ).rejects.toBeInstanceOf(ProblemDetailsException);
      expect(wastePasswordVerification).toHaveBeenCalledTimes(1);
    });

    it('não distingue email inexistente de senha errada na resposta', async () => {
      const missing = await buildIdentityService({ findUserByEmail: null });
      const wrongPassword = await buildIdentityService({
        findUserByEmail: EXISTING_USER,
        passwordMatches: false,
      });

      const missingProblem = await captureProblemDetails(
        missing.identityService.loginUser({ email: 'ninguem@example.com', password: 'x' }),
      );
      const wrongPasswordProblem = await captureProblemDetails(
        wrongPassword.identityService.loginUser({
          email: EXISTING_USER.email,
          password: 'x',
        }),
      );

      expect(missingProblem).toEqual(wrongPasswordProblem);
      expect(missingProblem.status).toBe(401);
    });
  });
});
