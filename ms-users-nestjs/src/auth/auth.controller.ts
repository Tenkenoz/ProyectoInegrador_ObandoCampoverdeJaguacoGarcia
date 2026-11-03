import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public/public.decorator.js';
import { LoginDto } from './dto/login.dto/login.dto.js';
import { CurrentUser } from './decorators/current-user/current-user.decorator.js';
import type { AuthenticatedUser } from './interfaces/authenticated-user/authenticated-user.interface.js';
import type { RequestWithId } from '../common/interfaces/request-with-id.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /*
   * Public route.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  login(
    @Body()
    dto: LoginDto,

    @Req()
    request: RequestWithId,
  ) {
    return this.authService.login(dto, request.requestId);
  }

  /*
   * Requires a valid JWT. No specific role is required.
   */
  @Get('profile')
  profile(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.authService.getProfile(user.userId);
  }

  @Get('me')
  me(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return this.authService.getProfile(user.userId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser()
    user: AuthenticatedUser,

    @Req()
    request: RequestWithId,
  ): Promise<void> {
    await this.authService.logout(user.userId, request.requestId);
  }
}
