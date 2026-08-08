import { ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { REQUIRED_ROLES_KEY } from './auth.decorator';
import type { UserRole } from './user-role.contracts';

// Roda DEPOIS do JwtAuthGuard (ordem dos APP_GUARD no app.module.ts) porque lê
// o authenticatedUser que aquele escreveu.
//
// Rota sem @RequireRoles libera qualquer usuário autenticado: autenticação é
// default-deny, autorização por papel é opt-in explícito. É intencional.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles === undefined || requiredRoles.length === 0) return true;

    const { authenticatedUser } = context.switchToHttp().getRequest<Request>();
    if (authenticatedUser === undefined || !requiredRoles.includes(authenticatedUser.role)) {
      throw new ForbiddenException('Papel insuficiente para esta rota');
    }
    return true;
  }
}
