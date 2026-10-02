import { Module } from '@nestjs/common';
import { StaffBankService } from './staff-bank.service';
import { StaffBankController } from './staff-bank.controller';

@Module({
  controllers: [StaffBankController],
  providers: [StaffBankService],
  exports: [StaffBankService],
})
export class StaffBankModule {}
