import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { AccessTokenService } from './access-token.service';
import { PasswordHasherService } from './password-hasher.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenService } from './refresh-token.service';

// @Global() é obrigatório: JwtAuthGuard e RolesGuard são instanciados pelo
// container no escopo do AppModule e dependem de AccessTokenService. Sem isso a
// aplicação não sobe — falha de DI no boot, com mensagem confusa.
@Global()
@Module({
  imports: [JwtModule.register({}), DatabaseModule],
  providers: [
    AccessTokenService,
    PasswordHasherService,
    RefreshTokenRepository,
    RefreshTokenService,
  ],
  exports: [AccessTokenService, PasswordHasherService, RefreshTokenService],
})
export class AuthModule {}
