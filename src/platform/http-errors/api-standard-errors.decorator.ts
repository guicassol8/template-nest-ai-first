import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ProblemDetailsDto } from './problem-details.contracts';

// Um decorator só, em vez de seis @ApiResponse por rota. O app mobile é gerado
// a partir do openapi.json e precisa saber que qualquer rota pode devolver
// problem details; repetir isso em cada handler é a duplicação que o P4 proíbe.
const STANDARD_ERROR_STATUSES = [
  { status: 400, description: 'Requisição inválida' },
  { status: 401, description: 'Não autenticado' },
  { status: 403, description: 'Papel insuficiente' },
  { status: 404, description: 'Recurso não encontrado' },
  { status: 429, description: 'Rate limit excedido' },
  { status: 500, description: 'Erro interno' },
] as const;

export const ApiStandardErrorResponses = (): MethodDecorator =>
  applyDecorators(
    ...STANDARD_ERROR_STATUSES.map((error) =>
      ApiResponse({ ...error, type: ProblemDetailsDto }),
    ),
  );
