import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseReadinessService } from './database-readiness.service';
import { PrismaService } from './prisma.service';

@Module({
  imports: [TerminusModule],
  providers: [PrismaService, DatabaseReadinessService],
  exports: [PrismaService, DatabaseReadinessService],
})
export class DatabaseModule {}
