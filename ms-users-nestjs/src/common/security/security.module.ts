import { Module } from '@nestjs/common';
import { PasswordHasher } from './password-hasher.service.js';

@Module({
  providers: [PasswordHasher],
  exports: [PasswordHasher],
})
export class SecurityModule {}
