import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '@prisma/client';

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  revokedAt: Date | null;
  expiresAt: Date;
};

export type InsertRefreshTokenInput = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
};

// Único arquivo de platform/auth que fala com o Prisma. A capacidade de sessão
// é de plataforma, então a tabela é dela — identity nunca toca RefreshToken.
@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertRefreshToken(input: InsertRefreshTokenInput): Promise<void> {
    await this.prisma.refreshToken.create({ data: input });
  }

  findRefreshTokenById(id: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({ where: { id } });
  }

  async revokeTokenFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }

  // Revogar a linha atual e gravar a nova precisa ser atômico: sem transação,
  // uma falha no meio deixa a família sem token válido e desloga o usuário.
  async rotateRefreshToken(
    revokedTokenId: string,
    revokedAt: Date,
    next: InsertRefreshTokenInput,
  ): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.refreshToken.update({
        where: { id: revokedTokenId },
        data: { revokedAt },
      }),
      this.prisma.refreshToken.create({ data: next }),
    ];
    await this.prisma.$transaction(operations);
  }
}
