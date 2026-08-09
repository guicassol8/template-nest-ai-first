import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

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

  /**
   * Faxina oportunista: linhas expiradas (revogadas ou não) já não autenticam
   * nada e só engordam a tabela. Sem cron no projeto — de propósito —, o login
   * é o momento natural de descartar o lixo do próprio usuário.
   */
  async deleteExpiredRefreshTokens(userId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: now } },
    });
  }

  async revokeTokenFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }

  /**
   * Revoga a linha atual e grava a sucessora numa transação — e a revogação é
   * CONDICIONAL (`revokedAt: null` no where). Devolve false quando a linha já
   * estava revogada: dois refreshes concorrentes com o mesmo token disputam
   * esse update, e sem a condição os dois passariam calados, sem nunca acionar
   * a reuse detection. Quem decide se a derrota na corrida é retry ou roubo é
   * o service.
   */
  async rotateRefreshToken(
    revokedTokenId: string,
    revokedAt: Date,
    next: InsertRefreshTokenInput,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient): Promise<boolean> => {
        const { count } = await transaction.refreshToken.updateMany({
          where: { id: revokedTokenId, revokedAt: null },
          data: { revokedAt },
        });
        if (count === 0) return false;

        await transaction.refreshToken.create({ data: next });
        return true;
      },
    );
  }
}
