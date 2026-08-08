import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccessTokenService } from './access-token.service';

const ACCESS_SECRET = 'test-only-access-secret-0123456789abcdef';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const buildTestConfigService = (): ConfigService => {
  const values: Record<string, unknown> = {
    JWT_ACCESS_SECRET: ACCESS_SECRET,
    JWT_ACCESS_TTL_SECONDS: 900,
  };
  return new ConfigService(values);
};

describe('AccessTokenService', () => {
  let accessTokenService: AccessTokenService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        AccessTokenService,
        { provide: ConfigService, useValue: buildTestConfigService() },
      ],
    }).compile();

    accessTokenService = moduleRef.get(AccessTokenService);
    jwtService = moduleRef.get(JwtService);
  });

  it('emite um token que ele mesmo consegue verificar', async () => {
    const token = await accessTokenService.signAccessToken(USER_ID, 'admin');

    await expect(accessTokenService.verifyAccessToken(token)).resolves.toEqual({
      userId: USER_ID,
      role: 'admin',
    });
  });

  it('rejeita token assinado com outro segredo', async () => {
    const forged = await jwtService.signAsync(
      { sub: USER_ID, role: 'user' },
      { secret: 'outro-segredo-completamente-diferente-123', expiresIn: 900 },
    );

    await expect(accessTokenService.verifyAccessToken(forged)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita token expirado', async () => {
    const expired = await jwtService.signAsync(
      { sub: USER_ID, role: 'user' },
      { secret: ACCESS_SECRET, expiresIn: '-1s' },
    );

    await expect(accessTokenService.verifyAccessToken(expired)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // Assinatura válida com conteúdo inesperado é o caso que um guard ingênuo
  // deixa passar: sem o parse, `role` viraria undefined lá na frente.
  it('rejeita token com claims malformados mesmo com assinatura válida', async () => {
    const malformed = await jwtService.signAsync(
      { sub: 'nao-e-uuid', role: 'papel-que-nao-existe' },
      { secret: ACCESS_SECRET, expiresIn: 900 },
    );

    await expect(accessTokenService.verifyAccessToken(malformed)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
