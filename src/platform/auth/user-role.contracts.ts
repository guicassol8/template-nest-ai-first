import { z } from 'zod';

// platform/auth é dono do vocabulário de papéis porque papel é insumo do
// MECANISMO de autorização (RolesGuard, @RequireRoles, claim do token), não do
// domínio de cadastro. Se ele morasse em modules/identity, platform/auth
// precisaria importar de modules/ — o que o arch:check reprova.
export const USER_ROLES = ['admin', 'user'] as const;

export const UserRoleSchema = z
  .enum(USER_ROLES)
  .meta({ id: 'UserRole', description: 'Papel do usuário no sistema' });

export type UserRole = z.infer<typeof UserRoleSchema>;
