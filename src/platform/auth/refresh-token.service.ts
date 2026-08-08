import { randomUUID } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Environment } from '../config/environment.contracts';
import { RefreshTokenClaimsSchema } from './authenticated-user.contracts';
import { PasswordHasherService } from './password-hasher.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import type { RefreshTokenRecord } from './refresh-token.repository';

const MILLISECONDS_PER_SECOND = 1000;

export type RotatedRefreshToken = { userId: string; refreshToken: string };

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Environment, true>,
    private readonly passwordHasher: PasswordHasherService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  /** Abre uma família nova de rotação. Um login = uma família. */
  issueRefreshToken(userId: string): Promise<string> {
    return this.issueInFamily(userId, randomUUID());
  }

  /**
   * Com argon2 (salt aleatório) não existe busca por hash. Por isso o `jti` vai
   * dentro do JWT: a busca é por id e o hash só confirma que o token
   * apresentado é o mesmo que gerou aquela linha.
   */
  async rotateRefreshToken(presentedToken: string): Promise<RotatedRefreshToken> {
    const { claims, record } = await this.resolvePresentedToken(presentedToken);

    if (record.revokedAt !== null) {
      // Token já usado circulando de novo: só acontece se vazou. Mata a família
      // inteira — o legítimo e o atacante são deslogados juntos, de propósito.
      await this.refreshTokenRepository.revokeTokenFamily(record.familyId, new Date());
      this.logger.warn(
        { userId: record.userId, familyId: record.familyId },
        'refresh token reuse detected',
      );
      throw new UnauthorizedException('Sessão inválida');
    }

    const now = new Date();
    const nextTokenId = randomUUID();
    const nextToken = await this.signRefreshToken(
      record.userId,
      nextTokenId,
      record.familyId,
    );

    await this.refreshTokenRepository.rotateRefreshToken(record.id, now, {
      id: nextTokenId,
      userId: record.userId,
      familyId: record.familyId,
      tokenHash: await this.passwordHasher.hashPassword(nextToken),
      expiresAt: this.buildExpiryDate(now),
    });

    return { userId: claims.sub, refreshToken: nextToken };
  }

  /**
   * Logout. Não distingue token desconhecido de token já revogado: responder
   * diferente seria um oráculo de "esta sessão existe".
   */
  async revokeTokenFamily(presentedToken: string): Promise<void> {
    const claims = await this.readClaims(presentedToken);
    if (claims === null) return;

    const record = await this.refreshTokenRepository.findRefreshTokenById(claims.jti);
    if (record === null) return;

    await this.refreshTokenRepository.revokeTokenFamily(record.familyId, new Date());
  }

  private async issueInFamily(userId: string, familyId: string): Promise<string> {
    const tokenId = randomUUID();
    const token = await this.signRefreshToken(userId, tokenId, familyId);

    await this.refreshTokenRepository.insertRefreshToken({
      id: tokenId,
      userId,
      familyId,
      tokenHash: await this.passwordHasher.hashPassword(token),
      expiresAt: this.buildExpiryDate(new Date()),
    });

    return token;
  }

  private async resolvePresentedToken(
    presentedToken: string,
  ): Promise<{ claims: { sub: string; jti: string }; record: RefreshTokenRecord }> {
    const claims = await this.readClaims(presentedToken);
    if (claims === null) {
      throw new UnauthorizedException('Sessão inválida');
    }

    const record = await this.refreshTokenRepository.findRefreshTokenById(claims.jti);
    if (record === null || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Sessão inválida');
    }

    const matchesStoredHash = await this.passwordHasher.verifyPassword(
      record.tokenHash,
      presentedToken,
    );
    if (!matchesStoredHash) {
      throw new UnauthorizedException('Sessão inválida');
    }

    return { claims, record };
  }

  private async readClaims(
    presentedToken: string,
  ): Promise<{ sub: string; jti: string } | null> {
    const payload: unknown = await this.jwtService
      .verifyAsync(presentedToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      })
      .catch(() => null);

    const parsed = RefreshTokenClaimsSchema.safeParse(payload);
    return parsed.success ? { sub: parsed.data.sub, jti: parsed.data.jti } : null;
  }

  private signRefreshToken(
    userId: string,
    tokenId: string,
    familyId: string,
  ): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, jti: tokenId, fam: familyId },
      {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_REFRESH_TTL_SECONDS', { infer: true }),
      },
    );
  }

  private buildExpiryDate(from: Date): Date {
    const ttlSeconds = this.config.get('JWT_REFRESH_TTL_SECONDS', { infer: true });
    return new Date(from.getTime() + ttlSeconds * MILLISECONDS_PER_SECOND);
  }
}
