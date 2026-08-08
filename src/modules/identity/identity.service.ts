import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AccessTokenService } from '../../platform/auth/access-token.service';
import { PasswordHasherService } from '../../platform/auth/password-hasher.service';
import { RefreshTokenService } from '../../platform/auth/refresh-token.service';
import {
  PROBLEM_TYPES,
  ProblemDetailsException,
} from '../../platform/http-errors/problem-details.contracts';
import { IdentityRepository } from './identity.repository';
import type {
  AuthTokens,
  LoginRequest,
  RegisterUserRequest,
  User,
  UserRecord,
} from './identity.contracts';

const toUser = ({ id, email, role, createdAt }: UserRecord): User => ({
  id,
  email,
  role,
  createdAt,
});

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly accessTokenService: AccessTokenService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async registerUser(request: RegisterUserRequest): Promise<AuthTokens> {
    const created = await this.identityRepository.insertUser({
      email: request.email,
      passwordHash: await this.passwordHasher.hashPassword(request.password),
      role: 'user',
    });

    if (created === null) {
      throw new ProblemDetailsException(
        PROBLEM_TYPES.emailAlreadyRegistered,
        HttpStatus.CONFLICT,
        'Email já cadastrado',
      );
    }

    this.logger.log({ userId: created.id }, 'user registered');
    return this.issueAuthTokens(created);
  }

  /**
   * A resposta não distingue "email não existe" de "senha errada": nem na
   * mensagem, nem no tempo. Por isso o caminho do email inexistente também
   * gasta um argon2 antes de falhar.
   */
  async loginUser(request: LoginRequest): Promise<AuthTokens> {
    const found = await this.identityRepository.findUserByEmail(request.email);

    if (found === null) {
      await this.passwordHasher.wastePasswordVerification(request.password);
      throw this.buildInvalidCredentialsError();
    }

    const passwordMatches = await this.passwordHasher.verifyPassword(
      found.passwordHash,
      request.password,
    );
    if (!passwordMatches) {
      this.logger.warn({ userId: found.id }, 'login failed');
      throw this.buildInvalidCredentialsError();
    }

    return this.issueAuthTokens(found);
  }

  async refreshAuthTokens(presentedRefreshToken: string): Promise<AuthTokens> {
    const rotated =
      await this.refreshTokenService.rotateRefreshToken(presentedRefreshToken);

    const found = await this.identityRepository.findUserById(rotated.userId);
    if (found === null) {
      throw this.buildInvalidCredentialsError();
    }

    return {
      accessToken: await this.accessTokenService.signAccessToken(found.id, found.role),
      refreshToken: rotated.refreshToken,
      expiresInSeconds: this.accessTokenService.getAccessTokenTtlSeconds(),
    };
  }

  async logoutUser(presentedRefreshToken: string): Promise<void> {
    await this.refreshTokenService.revokeTokenFamily(presentedRefreshToken);
  }

  async findUserById(userId: string): Promise<User> {
    const found = await this.identityRepository.findUserById(userId);
    if (found === null) {
      throw new ProblemDetailsException(
        PROBLEM_TYPES.resourceNotFound,
        HttpStatus.NOT_FOUND,
        'Usuário não encontrado',
      );
    }
    return toUser(found);
  }

  private async issueAuthTokens(user: UserRecord): Promise<AuthTokens> {
    return {
      accessToken: await this.accessTokenService.signAccessToken(user.id, user.role),
      refreshToken: await this.refreshTokenService.issueRefreshToken(user.id),
      expiresInSeconds: this.accessTokenService.getAccessTokenTtlSeconds(),
    };
  }

  private buildInvalidCredentialsError(): ProblemDetailsException {
    return new ProblemDetailsException(
      PROBLEM_TYPES.invalidCredentials,
      HttpStatus.UNAUTHORIZED,
      'Credenciais inválidas',
    );
  }
}
