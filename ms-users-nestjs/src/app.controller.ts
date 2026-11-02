import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public/public.decorator.js';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'user-service',
      timestamp: new Date().toISOString(),
    };
  }
}
