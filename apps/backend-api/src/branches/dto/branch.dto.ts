import { OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBranchDto {
  /** Ignored for ORG_ADMIN: their own organization is always used. */
  @IsOptional() @IsUUID() organizationId?: string;
  @IsString() @MaxLength(120) name: string;
  @IsString() @MaxLength(30) branchCode: string;
  @IsString() @MaxLength(200) addressLine1: string;
  @IsOptional() @IsString() @MaxLength(200) addressLine2?: string;
  @IsString() @MaxLength(80) city: string;
  @IsString() @MaxLength(12) postcode: string;
  @IsString() @MaxLength(25) phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsUUID() managerId?: string;
}

export class UpdateBranchDto extends PartialType(OmitType(CreateBranchDto, ['organizationId', 'branchCode'] as const)) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RotaQueryDto {
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class BranchListQueryDto {
  @IsOptional() @IsUUID() organizationId?: string;
}
