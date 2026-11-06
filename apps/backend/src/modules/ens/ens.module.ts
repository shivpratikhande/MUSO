import { Module } from '@nestjs/common';
import { EnsController } from './ens.controller.js';
import { EnsService } from './ens.service.js';

@Module({
  controllers: [EnsController],
  providers: [EnsService],
  exports: [EnsService],
})
export class EnsModule {}
