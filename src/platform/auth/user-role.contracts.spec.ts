import { $Enums } from '../../generated/prisma/client';
import type { UserRole as PrismaUserRole } from '../../generated/prisma/client';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { USER_ROLES, type UserRole } from './user-role.contracts';

// UserRole existe no Prisma (persistência) e no Zod (API). Não dá para eliminar
// a duplicação sem um gerador extra, então ela fica travada por teste.
describe('UserRole', () => {
  it('mantém os papéis do Zod e do Prisma em sincronia', () => {
    // Verificado pelo `pnpm typecheck` (em runtime é no-op)...
    expectTypeOf<UserRole>().toEqualTypeOf<PrismaUserRole>();
    // ...e esta linha, pelo `pnpm test`. Precisa das duas.
    expect([...USER_ROLES].sort()).toEqual(Object.values($Enums.UserRole).sort());
  });
});
