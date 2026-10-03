import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { ShiftStatus, ShiftVisibility } from '@prisma/client';

export class CreateShiftDto {
  @IsUUID() branchId: string;
  @IsString() @MaxLength(120) title: string;
  @IsOptional() @IsString() @MaxLength(60) roleRequired?: string;
  @IsDateString() startTime: string;
  @IsDateString() endTime: string;
  @IsNumber() @Min(1) @Max(1000) hourlyRate: number;
  @IsOptional() @IsArray() @IsString({ each: true }) requiredSystems?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) requiredAccreditations?: string[];
  @IsOptional() @IsEnum(ShiftVisibility) visibility?: ShiftVisibility;
  @IsOptional() @IsBoolean() instantBookEnabled?: boolean;
  @IsOptional() @IsBoolean() isOvernight?: boolean;
  @IsOptional() @IsBoolean() isEmergency?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  /** Staff-bank shifts cascade Tier 1 → 2 → 3 → marketplace on a timer. Pass false to expose the whole bank at once. */
  @IsOptional() @IsBoolean() cascade?: boolean;
}

export class UpdateShiftDto extends PartialType(OmitType(CreateShiftDto, ['branchId'] as const)) {}

export class AssignWorkerDto {
  @IsUUID() reliefWorkerId: string;
  /** ORG_ADMIN / SUPER_ADMIN only: ignore missing systems/accreditations (compliance documents are never skipped). */
  @IsOptional() @IsBoolean() overrideSkills?: boolean;
}

export class UpdateShiftStatusDto {
  @IsEnum(ShiftStatus) status: ShiftStatus;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ApplyDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class FeedQueryDto {
  @IsOptional() @IsIn(['for_you', 'watching', 'favourites', 'emergencies']) tab?: 'for_you' | 'watching' | 'favourites' | 'emergencies';
  @IsOptional() @IsString() @MaxLength(60) profession?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minRate?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class ShiftListQueryDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsEnum(ShiftStatus) status?: ShiftStatus;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
