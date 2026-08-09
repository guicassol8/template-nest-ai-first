import { Injectable } from '@nestjs/common';
// Imports nomeados com alias: `hash`/`verify` pelados são genéricos demais para
// busca textual — hashWithArgon2 diz o que é em qualquer call site.
import { argon2id, hash as hashWithArgon2, verify as verifyWithArgon2 } from 'argon2';

// Hash fixo de uma senha aleatória descartada. Serve para o caminho do email
// inexistente gastar o mesmo tempo do caminho normal — sem isso, a diferença de
// timing entrega quais emails estão cadastrados.
const DECOY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$Y2Fycm90LXNhbHQtZm9yLWRlY295$5xk3wJc0GkQzXBLQhJKHYQF8m0dQ0kZ6oXWZ8zXn1Vs';

@Injectable()
export class PasswordHasherService {
  // argon2id, nunca bcrypt, nunca SHA: senha humana tem entropia baixa e
  // precisa de uma função cara em memória, não só em CPU.
  hashPassword(plainPassword: string): Promise<string> {
    return hashWithArgon2(plainPassword, { type: argon2id });
  }

  async verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await verifyWithArgon2(hash, plainPassword);
    } catch {
      // Hash corrompido ou de outro algoritmo: é falha de verificação, não 500.
      return false;
    }
  }

  // Chamado quando o email não existe, para igualar o custo dos dois caminhos.
  async wastePasswordVerification(plainPassword: string): Promise<void> {
    await this.verifyPassword(DECOY_PASSWORD_HASH, plainPassword);
  }
}
