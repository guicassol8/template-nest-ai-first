import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenService } from './access-token.service';
import { IS_PUBLIC_ROUTE_KEY } from './auth.decorator';

const BEARER_PREFIX = 'Bearer ';

// Guard global: autenticação é default-deny. Rota pública precisa dizer
// @PublicRoute() explicitamente — o default inseguro é a origem da maioria dos
// vazamentos de endpoint.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // `| undefined` é obrigatório: a rota pode não ter o metadata, e sem isso o
    // no-unnecessary-condition acha que a checagem abaixo é redundante.
    const isPublicRoute = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublicRoute === true) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authorizationHeader = request.headers.authorization;
    if (
      authorizationHeader === undefined ||
      !authorizationHeader.startsWith(BEARER_PREFIX)
    ) {
      throw new UnauthorizedException('Token ausente');
    }

    request.authenticatedUser = await this.accessTokenService.verifyAccessToken(
      authorizationHeader.slice(BEARER_PREFIX.length),
    );
    return true;
  }
}
