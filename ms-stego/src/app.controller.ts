import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator.js';
import { AppService } from './app.service.js';

@Public()
@ApiTags('Health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOkResponse({ description: 'STEGO and its database are available.' })
  @ApiServiceUnavailableResponse({ description: 'Database is unavailable.' })
  health() {
    return this.appService.health();
  }
}
