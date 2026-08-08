import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRoleSchema } from '../../platform/auth/user-role.contracts';

// ─── Entidade canônica (formato de API) ──────────────────────────────
export const UserSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    role: UserRoleSchema,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'User' });

// ─── Derivados (nunca reescreva a entidade) ──────────────────────────
// max(256) porque argon2 processa a entrada inteira: senha gigante é DoS barato.
export const UserPasswordSchema = z.string().min(8).max(256);

export const RegisterUserRequestSchema = z
  .object({ email: z.email(), password: UserPasswordSchema })
  .meta({ id: 'RegisterUserRequest' });

export const LoginRequestSchema = z
  .object({ email: z.email(), password: z.string().min(1).max(256) })
  .meta({ id: 'LoginRequest' });

export const RefreshRequestSchema = z
  .object({ refreshToken: z.string().min(1) })
  .meta({ id: 'RefreshRequest' });

export const AuthTokensSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresInSeconds: z.number().int(),
  })
  .meta({ id: 'AuthTokens' });

// ─── DTOs (classes, para os decorators do Nest) ──────────────────────
export class RegisterUserRequestDto extends createZodDto(RegisterUserRequestSchema) {}
export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}
export class RefreshRequestDto extends createZodDto(RefreshRequestSchema) {}
export class UserDto extends createZodDto(UserSchema) {}
export class AuthTokensDto extends createZodDto(AuthTokensSchema) {}

// ─── Tipos inferidos ─────────────────────────────────────────────────
export type User = z.infer<typeof UserSchema>;
export type RegisterUserRequest = z.infer<typeof RegisterUserRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

// Formato interno de persistência do módulo — nunca sai no .public.ts
export type UserRecord = User & { passwordHash: string };
