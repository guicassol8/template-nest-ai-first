import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RolesGuard } from './roles.guard';
import { RequireRoles } from './auth.decorator';
import type { AuthenticatedUser } from './authenticated-user.contracts';

// ExecutionContextHost é a implementação real que o Nest usa em runtime. Forjar
// um objeto com o formato de ExecutionContext exigiria `as unknown as`, que é
// proibido — e testaria o fake, não o guard.
class OpenProbeController {
  handleProbeRoute(this: void): void {
    return undefined;
  }
}

class AdminOnlyProbeController {
  @RequireRoles('admin')
  handleProbeRoute(this: void): void {
    return undefined;
  }
}

const buildExecutionContext = (
  controller: typeof OpenProbeController | typeof AdminOnlyProbeController,
  authenticatedUser: AuthenticatedUser | undefined,
): ExecutionContext =>
  new ExecutionContextHost(
    [{ authenticatedUser }],
    controller,
    controller.prototype.handleProbeRoute,
  );

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('libera qualquer usuário autenticado quando a rota não tem @RequireRoles', () => {
    const context = buildExecutionContext(OpenProbeController, { userId: 'u1', role: 'user' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('responde 403 quando o papel do usuário não está na lista', () => {
    const context = buildExecutionContext(AdminOnlyProbeController, { userId: 'u1', role: 'user' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('libera quando o papel do usuário está na lista', () => {
    const context = buildExecutionContext(AdminOnlyProbeController, { userId: 'u1', role: 'admin' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('responde 403 quando a rota exige papel e não há usuário no request', () => {
    const context = buildExecutionContext(AdminOnlyProbeController, undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
