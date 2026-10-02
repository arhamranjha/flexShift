import { Module } from '@nestjs/common';
import { ReliefWorkersService } from './relief-workers.service';
import { ReliefWorkersController } from './relief-workers.controller';

@Module({
  controllers: [ReliefWorkersController],
  providers: [ReliefWorkersService],
  exports: [ReliefWorkersService],
})
export class ReliefWorkersModule {}
