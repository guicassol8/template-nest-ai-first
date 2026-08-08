import { Injectable } from '@nestjs/common';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from './prisma.service';

// Existe para que health.controller.ts não precise importar PrismaService: a
// fronteira do banco continua verificada por máquina em vez de depender da boa
// vontade de quem escreve o controller.
@Injectable()
export class DatabaseReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prismaHealthIndicator: PrismaHealthIndicator,
  ) {}

  checkDatabaseConnection(): Promise<HealthIndicatorResult> {
    return this.prismaHealthIndicator.pingCheck('database', this.prisma);
  }
}
