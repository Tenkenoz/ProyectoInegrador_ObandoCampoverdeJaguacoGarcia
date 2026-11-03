import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtKeyService } from './jwt-key.service.js';

@Module({
  imports: [ConfigModule],
  providers: [JwtKeyService],
  exports: [JwtKeyService],
})
export class JwtKeysModule {}
