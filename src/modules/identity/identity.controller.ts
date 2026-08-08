import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { CurrentUser, PublicRoute } from '../../platform/auth/auth.decorator';
import { ApiStandardErrorResponses } from '../../platform/http-errors/api-standard-errors.decorator';
import { IdentityService } from './identity.service';
import type { AuthenticatedUser } from '../../platform/auth/authenticated-user.contracts';
import {
  AuthTokensDto,
  LoginRequestDto,
  RefreshRequestDto,
  RegisterUserRequestDto,
  UserDto,
} from './identity.contracts';
import type { AuthTokens, User } from './identity.contracts';

// O arquivo é identity.* e as rotas são /auth/*, de propósito: o nome do
// arquivo segue o módulo (grep por "identity" acha tudo), o prefixo da rota
// segue o vocabulário do cliente. Não "conserte".
//
// 5 req/min nas rotas públicas: elas chamam argon2, e sem o limite 20
// requisições paralelas derrubam o processo.
const PUBLIC_AUTH_THROTTLE = { default: { ttl: 60_000, limit: 5 } };

@ApiTags('auth')
@Controller('auth')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('register')
  @PublicRoute()
  @Throttle(PUBLIC_AUTH_THROTTLE)
  @ZodResponse({ status: 201, type: AuthTokensDto })
  @ApiStandardErrorResponses()
  registerUser(@Body() body: RegisterUserRequestDto): Promise<AuthTokens> {
    return this.identityService.registerUser(body);
  }

  @Post('login')
  @PublicRoute()
  @Throttle(PUBLIC_AUTH_THROTTLE)
  @ZodResponse({ status: 200, type: AuthTokensDto })
  @ApiStandardErrorResponses()
  @HttpCode(200)
  loginUser(@Body() body: LoginRequestDto): Promise<AuthTokens> {
    return this.identityService.loginUser(body);
  }

  @Post('refresh')
  @PublicRoute()
  @Throttle(PUBLIC_AUTH_THROTTLE)
  @ZodResponse({ status: 200, type: AuthTokensDto })
  @ApiStandardErrorResponses()
  @HttpCode(200)
  refreshAuthTokens(@Body() body: RefreshRequestDto): Promise<AuthTokens> {
    return this.identityService.refreshAuthTokens(body.refreshToken);
  }

  // Única rota sem @ZodResponse: 204 não tem corpo para serializar.
  @Post('logout')
  @ApiBearerAuth()
  @ApiStandardErrorResponses()
  @HttpCode(204)
  logoutUser(@Body() body: RefreshRequestDto): Promise<void> {
    return this.identityService.logoutUser(body.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ZodResponse({ status: 200, type: UserDto })
  @ApiStandardErrorResponses()
  getAuthenticatedUser(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.identityService.findUserById(user.userId);
  }
}
