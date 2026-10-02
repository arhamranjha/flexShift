import { IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { LeaveType } from '@prisma/client';

export class SubmitLeaveDto {
  @IsUUID() branchId: string;
  @IsString() @MaxLength(100) staffName: string;
  @IsString() @MaxLength(60) staffRole: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsEnum(LeaveType) leaveType?: LeaveType;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ReviewLeaveDto {
  @IsIn(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsBoolean() autoCreateShiftVacancy?: boolean;
  /** Hourly rate for the generated vacancies (default 30). */
  @IsOptional() @IsNumber() @Min(1) @Max(1000) backfillHourlyRate?: number;
}
