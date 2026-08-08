import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRoleSchema } from './user-role.contracts';

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

export const AuthenticatedUserSchema = z
  .object({ userId: z.uuid(), role: UserRoleSchema })
  .meta({ id: 'AuthenticatedUser' });

// Precisa ser um DTO nestjs-zod, não um type: o pipe global roda com
// strictSchemaDeclaration e recusa qualquer parâmetro de handler que não seja
// um. De quebra, o objeto que o guard escreveu é validado antes de chegar no
// controller.
export class AuthenticatedUserDto extends createZodDto(AuthenticatedUserSchema) {}

export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;
export type RefreshTokenClaims = z.infer<typeof RefreshTokenClaimsSchema>;
export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;

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
