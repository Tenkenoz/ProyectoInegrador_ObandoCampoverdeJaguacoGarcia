import {
  Controller,
  Get,
  Header,
  VERSION_NEUTRAL,
  Version,
} from '@nestjs/common';
import { Public } from '../decorators/public/public.decorator.js';
import { JwtKeyService, type Jwks } from '../jwt-keys/jwt-key.service.js';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly jwtKeyService: JwtKeyService) {}

  @Public()
  @Get('jwks.json')
  @Version(VERSION_NEUTRAL)
  @Header('Cache-Control', 'public, max-age=300')
  getJwks(): Jwks {
    return this.jwtKeyService.getJwks();
  }
}
