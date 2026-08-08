import {
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { CustomDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.contracts';
import type { UserRole } from './user-role.contracts';

export const IS_PUBLIC_ROUTE_KEY = 'isPublicRoute';
export const REQUIRED_ROLES_KEY = 'requiredRoles';

// Tipo de retorno explícito: são funções exportadas, e
// explicit-module-boundary-types é `error`.
export const PublicRoute = (): CustomDecorator<string> =>
  SetMetadata(IS_PUBLIC_ROUTE_KEY, true);

export const RequireRoles = (...roles: UserRole[]): CustomDecorator<string> =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const { authenticatedUser } = context.switchToHttp().getRequest<Request>();
    if (authenticatedUser === undefined) {
      throw new UnauthorizedException('Rota autenticada sem usuário no request');
    }
    return authenticatedUser;
  },
);
