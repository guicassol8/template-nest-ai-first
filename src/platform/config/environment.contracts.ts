import { z } from 'zod';

export const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().default(900),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().default(60 * 60 * 24 * 30),
  // Reuso de refresh token até aqui após a rotação é retry de rede (UX), não
  // roubo. Fora da janela, a família inteira é revogada.
  JWT_REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).default(60),
  // Saltos de proxy confiáveis na frente da API. Sem isso, atrás de um LB o
  // rate limit enxerga o IP do proxy e limita a base inteira como um cliente só.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug']).default('info'),
  CORS_ALLOWED_ORIGINS: z.string().default(''), // CSV; vazio = nenhuma origem de browser
  SEED_ADMIN_EMAIL: z.email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

// Roda no boot do ConfigModule: app com env faltando não sobe, em vez de
// quebrar na primeira request que precisar da variável.
export const validateEnvironment = (raw: Record<string, unknown>): Environment =>
  EnvironmentSchema.parse(raw);
