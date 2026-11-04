import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseFilters,
  UseGuards,
  VERSION_NEUTRAL,
  Version,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../auth/decorators/public/public.decorator.js';
import type { RequestWithId } from '../../common/interfaces/request-with-id.js';
import { ServiceHmacGuard } from '../service-auth/service-hmac.guard.js';
import { AuthorizationCheckDto } from './dto/authorization-check.dto.js';
import { InternalAuthorizationExceptionFilter } from './internal-authorization-exception.filter.js';
import { InternalAuthorizationService } from './internal-authorization.service.js';

@Controller('internal/authorization')
@Public()
@SkipThrottle()
@UseGuards(ServiceHmacGuard)
@UseFilters(InternalAuthorizationExceptionFilter)
export class InternalAuthorizationController {
  constructor(
    private readonly internalAuthorizationService: InternalAuthorizationService,
  ) {}

  @Post('check')
  @Version(VERSION_NEUTRAL)
  @HttpCode(HttpStatus.OK)
  check(
    @Body()
    dto: AuthorizationCheckDto,

    @Req()
    request: RequestWithId,
  ) {
    return this.internalAuthorizationService.check(dto, request.requestId);
  }
}
