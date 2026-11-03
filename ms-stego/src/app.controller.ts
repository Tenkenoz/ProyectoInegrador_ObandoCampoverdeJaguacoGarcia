import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AppService } from './app.service.js';

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
