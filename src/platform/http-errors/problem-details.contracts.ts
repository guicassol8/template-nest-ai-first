import { HttpException } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const PROBLEM_TYPE_BASE = 'https://api.example.app/problems';

export const PROBLEM_TYPES = {
  validationFailed: `${PROBLEM_TYPE_BASE}/validation-failed`,
  invalidCredentials: `${PROBLEM_TYPE_BASE}/invalid-credentials`,
  authenticationRequired: `${PROBLEM_TYPE_BASE}/authentication-required`,
  insufficientRole: `${PROBLEM_TYPE_BASE}/insufficient-role`,
  resourceNotFound: `${PROBLEM_TYPE_BASE}/resource-not-found`,
  emailAlreadyRegistered: `${PROBLEM_TYPE_BASE}/email-already-registered`,
  rateLimitExceeded: `${PROBLEM_TYPE_BASE}/rate-limit-exceeded`,
  internalError: `${PROBLEM_TYPE_BASE}/internal-error`,
} as const;

export const ProblemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    instance: z.string().optional(), // = x-request-id
    errors: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(), // só para validationFailed
  })
  .meta({ id: 'ProblemDetails' });

// É o que coloca ProblemDetails em components.schemas do openapi.json — o app
// mobile gera o tipo de erro do SDK a partir daí.
export class ProblemDetailsDto extends createZodDto(ProblemDetailsSchema) {}

// nestjs-zod devolve `getZodError(): unknown` de propósito. Em vez de forçar um
// tipo, a borda é parseada — é a mesma regra que vale para HTTP, env e JWT.
export const ValidationIssuesSchema = z.object({
  issues: z.array(
    z.object({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
export type ProblemType = (typeof PROBLEM_TYPES)[keyof typeof PROBLEM_TYPES];

// O cliente mobile decide o comportamento pelo `type`, nunca pela string de
// `title`. Um service que precisa de um type específico lança isto; qualquer
// outra exceção cai no mapeamento por status do filter.
export class ProblemDetailsException extends HttpException {
  constructor(
    readonly problemType: ProblemType,
    status: number,
    title: string,
  ) {
    super(title, status);
  }
}
