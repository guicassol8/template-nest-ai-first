import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { User as PrismaUser } from '../../generated/prisma/client';
import { PrismaService } from '../../platform/database/prisma.service';
import type { RegisterUserRequest, UserRecord } from './identity.contracts';
import type { UserRole } from '../../platform/auth/user-role.contracts';

// Derivado do contrato de request em vez de reescrito: um campo novo em
// RegisterUserRequest chega aqui sozinho, sem editar este arquivo.
export type InsertUserInput = Omit<RegisterUserRequest, 'password'> & {
  passwordHash: string;
  role: UserRole;
};

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

// UserRecord é o formato interno (inclui passwordHash); User é o contrato de
// API (não inclui). A tradução linha → contrato acontece aqui e só aqui.
const toUserRecord = (row: PrismaUser): UserRecord => ({
  id: row.id,
  email: row.email,
  role: row.role,
  createdAt: row.createdAt.toISOString(),
  passwordHash: row.passwordHash,
});

@Injectable()
export class IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row === null ? null : toUserRecord(row);
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row === null ? null : toUserRecord(row);
  }

  /**
   * Devolve null quando o email já existe. Checar antes com um findUnique
   * seria uma corrida: duas requisições simultâneas passariam as duas.
   */
  async insertUser(input: InsertUserInput): Promise<UserRecord | null> {
    try {
      return toUserRecord(await this.prisma.user.create({ data: input }));
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_ERROR_CODE
      ) {
        return null;
      }
      throw error;
    }
  }
}
