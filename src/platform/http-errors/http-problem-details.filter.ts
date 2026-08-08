import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import type { Response } from 'express';
import {
  PROBLEM_TYPES,
  ProblemDetailsException,
  ValidationIssuesSchema,
  type ProblemDetails,
  type ProblemType,
} from './problem-details.contracts';

/** `problem.status` vem do schema Zod como `number`, não como HttpStatus. */
const SERVER_ERROR_FLOOR = 500;

@Catch()
export class HttpProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const problem = buildProblemDetails(exception, readRequestId(response));

    // Stack só no log. Para o cliente, ≥ 500 é sempre internalError genérico.
    if (problem.status >= SERVER_ERROR_FLOOR) {
      this.logger.error(
        { err: exception, instance: problem.instance },
        'unhandled error',
      );
    }

    response.status(problem.status).type('application/problem+json').json(problem);
  }
}

// O x-request-id é escrito pelo genReqId do pino (logging.module.ts) antes de
// qualquer handler rodar, então já está na resposta quando o filter assume.
const readRequestId = (response: Response): string | undefined => {
  const header = response.getHeader('x-request-id');
  return typeof header === 'string' ? header : undefined;
};

const buildProblemDetails = (
  exception: unknown,
  requestId: string | undefined,
): ProblemDetails => {
  const instance = requestId === undefined ? {} : { instance: requestId };

  if (exception instanceof ZodValidationException) {
    const parsed = ValidationIssuesSchema.safeParse(exception.getZodError());
    return {
      type: PROBLEM_TYPES.validationFailed,
      title: 'Requisição inválida',
      status: HttpStatus.BAD_REQUEST,
      ...instance,
      ...(parsed.success
        ? {
            errors: parsed.data.issues.map((issue) => ({
              path: issue.path.map((segment) => String(segment)).join('.'),
              message: issue.message,
            })),
          }
        : {}),
    };
  }

  // Resposta que não bate com o contrato é bug nosso, não erro do cliente.
  if (exception instanceof ZodSerializationException) {
    return internalProblemDetails(instance);
  }

  if (exception instanceof ThrottlerException) {
    return {
      type: PROBLEM_TYPES.rateLimitExceeded,
      title: 'Muitas requisições',
      status: HttpStatus.TOO_MANY_REQUESTS,
      ...instance,
    };
  }

  if (exception instanceof ProblemDetailsException) {
    return {
      type: exception.problemType,
      title: exception.message,
      status: exception.getStatus(),
      ...instance,
    };
  }

  if (exception instanceof HttpException) {
    const status: HttpStatus = exception.getStatus();
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return internalProblemDetails(instance);
    }
    return {
      type: problemTypeForStatus(status),
      title: exception.message,
      status,
      ...instance,
    };
  }

  return internalProblemDetails(instance);
};

const internalProblemDetails = (instance: { instance?: string }): ProblemDetails => ({
  type: PROBLEM_TYPES.internalError,
  title: 'Erro interno',
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  ...instance,
});

// Lookup em vez de switch de propósito: HttpStatus tem ~50 membros e um switch
// sobre ele nunca seria exaustivo — a saída seria afrouxar
// switch-exhaustiveness-check, que precisa continuar apertada para as unions
// fechadas do domínio (UserRole).
const PROBLEM_TYPE_BY_STATUS: Partial<Record<HttpStatus, ProblemType>> = {
  [HttpStatus.BAD_REQUEST]: PROBLEM_TYPES.validationFailed,
  [HttpStatus.UNAUTHORIZED]: PROBLEM_TYPES.authenticationRequired,
  [HttpStatus.FORBIDDEN]: PROBLEM_TYPES.insufficientRole,
  [HttpStatus.NOT_FOUND]: PROBLEM_TYPES.resourceNotFound,
  [HttpStatus.TOO_MANY_REQUESTS]: PROBLEM_TYPES.rateLimitExceeded,
};

const problemTypeForStatus = (status: HttpStatus): ProblemType =>
  PROBLEM_TYPE_BY_STATUS[status] ?? PROBLEM_TYPES.internalError;
