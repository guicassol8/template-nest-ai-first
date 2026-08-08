import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module';
import { IdentityController } from './identity.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController],
  providers: [IdentityService, IdentityRepository],
  exports: [IdentityService],
})
export class IdentityModule {}
