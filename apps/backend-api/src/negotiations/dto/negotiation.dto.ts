import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { NegotiationStatus } from '@prisma/client';

export class CreateNegotiationDto {
  @IsUUID() shiftId: string;
  @IsNumber() @Min(1) @Max(1000) proposedHourlyRate: number;
  @IsOptional() @IsDateString() proposedStartTime?: string;
  @IsOptional() @IsDateString() proposedEndTime?: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}

export class CounterOfferDto {
  @IsNumber() @Min(1) @Max(1000) counterOfferRate: number;
}

export class NegotiationQueryDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsEnum(NegotiationStatus) status?: NegotiationStatus;
}
