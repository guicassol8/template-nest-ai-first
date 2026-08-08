import { z } from 'zod';
import { UserRoleSchema, type UserRole } from './user-role.contracts';

export const AccessTokenClaimsSchema = z
  .object({
    sub: z.uuid(),
    role: UserRoleSchema,
    iat: z.number(),
    exp: z.number(),
  })
  .meta({ id: 'AccessTokenClaims' });

export const RefreshTokenClaimsSchema = z
  .object({
    sub: z.uuid(),
    jti: z.uuid(), // id da linha em RefreshToken — a busca é por ele
    fam: z.uuid(), // id da família de rotação
    iat: z.number(),
    exp: z.number(),
  })
  .meta({ id: 'RefreshTokenClaims' });

export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;
export type RefreshTokenClaims = z.infer<typeof RefreshTokenClaimsSchema>;
export type AuthenticatedUser = { userId: string; role: UserRole };

// O guard escreve aqui; o @CurrentUser lê daqui. Sem esta augmentation,
// getRequest<Request>() não conhece o campo e o código só compila com `as`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- a única forma de estender o Request do Express
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
    }
  }
}
