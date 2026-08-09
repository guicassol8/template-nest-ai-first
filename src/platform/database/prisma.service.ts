import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import type { Environment } from '../config/environment.contracts';

// Sem middlewares mágicos, sem soft-delete global implícito, sem extensões que
// alteram o comportamento de toda query: o que você lê no repository é o que roda.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // No Prisma 7 a conexão vem por driver adapter, e não mais de um env() dentro
  // do schema. Ganho real: a URL passa pelo ConfigService validado, como toda
  // outra configuração — o schema descreve só a forma dos dados.
  constructor(config: ConfigService<Environment, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
