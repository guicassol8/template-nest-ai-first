import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';
import { PublicRoute } from '../auth/auth.decorator';
import { DatabaseReadinessService } from '../database/database-readiness.service';

// Fica fora do prefixo /v1 (main.ts) e fora do guard global (@PublicRoute):
// probe de load balancer não pode quebrar quando a API virar v2.
@ApiTags('health')
@Controller('health')
@PublicRoute()
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly databaseReadinessService: DatabaseReadinessService,
  ) {}

  // Liveness: 200 enquanto o processo responde. Não checa dependência externa
  // de propósito — Postgres fora do ar não deve fazer o orquestrador matar o pod.
  @Get()
  @HealthCheck()
  checkLiveness(): Promise<HealthCheckResult> {
    return this.healthCheckService.check([]);
  }

  // Readiness: só entra no balanceador quem consegue falar com o Postgres.
  @Get('ready')
  @HealthCheck()
  checkReadiness(): Promise<HealthCheckResult> {
    return this.healthCheckService.check([
      () => this.databaseReadinessService.checkDatabaseConnection(),
    ]);
  }
}
