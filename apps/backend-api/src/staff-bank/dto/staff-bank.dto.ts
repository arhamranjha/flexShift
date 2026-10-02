import { PartialType, PickType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { StaffBankTier } from '@prisma/client';

export class AddStaffBankMemberDto {
  /** Ignored for non-super users: the caller's own organization is always used. */
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsUUID() reliefWorkerId: string;
  @IsOptional() @IsEnum(StaffBankTier) tier?: StaffBankTier;
  @IsOptional() @IsNumber() @Min(1) @Max(1000) customHourlyRate?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateStaffBankMemberDto {
  @IsOptional() @IsEnum(StaffBankTier) tier?: StaffBankTier;
  /** null clears the agreed rate (the worker's standard rate applies again). */
  @ValidateIf((o) => o.customHourlyRate !== undefined && o.customHourlyRate !== null) @IsNumber() @Min(1) @Max(1000)
  customHourlyRate?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class StaffBankQueryDto {
  @IsOptional() @IsUUID() branchId?: string;
}
