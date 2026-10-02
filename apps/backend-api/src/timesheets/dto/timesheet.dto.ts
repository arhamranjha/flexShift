import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { TimesheetStatus } from '@prisma/client';

export class SubmitTimesheetDto {
  @IsUUID() shiftId: string;
  @IsDateString() clockInTime: string;
  @IsDateString() clockOutTime: string;
  @IsOptional() @IsInt() @Min(0) @Max(480) breakMinutes?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class TimesheetQueryDto {
  @IsOptional() @IsEnum(TimesheetStatus) status?: TimesheetStatus;
}
