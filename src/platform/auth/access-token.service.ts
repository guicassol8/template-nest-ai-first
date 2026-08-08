import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Environment } from '../config/environment.contracts';
import {
  AccessTokenClaimsSchema,
  type AuthenticatedUser,
} from './authenticated-user.contracts';
import type { UserRole } from './user-role.contracts';

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  signAccessToken(userId: string, role: UserRole): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, role },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
      },
    );
  }

  // O payload devolvido pelo JwtService é `any` por natureza: veio de fora do
  // processo. Passa pelo schema antes de virar AuthenticatedUser.
  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const claims = await this.decodeVerifiedClaims(token);
    return { userId: claims.sub, role: claims.role };
  }

  getAccessTokenTtlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  private async decodeVerifiedClaims(
    token: string,
  ): Promise<{ sub: string; role: UserRole }> {
    const payload: unknown = await this.jwtService
      .verifyAsync(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      })
      .catch(() => {
        throw new UnauthorizedException('Token inválido ou expirado');
      });

    const parsed = AccessTokenClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new UnauthorizedException('Token com claims malformados');
    }
    return { sub: parsed.data.sub, role: parsed.data.role };
  }
}
