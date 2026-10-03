import { IsArray, IsEmail, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MARKET_CODES } from '../../common/markets';
import { DocType } from '@prisma/client';

export class CreateOrganizationDto {
  @IsString() @MaxLength(120) name: string;
  @IsString() @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers and dashes' }) @MaxLength(60) slug: string;
  @IsString() @MaxLength(30) code: string;
  @IsEmail() billingEmail: string;
  @IsString() @MaxLength(25) phone: string;
  @IsOptional() @IsString() @MaxLength(40) subscriptionTier?: string;
  @IsOptional() @IsIn(MARKET_CODES) country?: string;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsEmail() billingEmail?: string;
  @IsOptional() @IsString() @MaxLength(25) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  /** Switching country applies that market's currency and timezone. Existing shifts and invoices keep their own currency. */
  @IsOptional() @IsIn(MARKET_CODES) country?: string;
  /** Extra credentials this organization requires on top of the platform-wide mandatory four. */
  @IsOptional() @IsArray() @IsEnum(DocType, { each: true }) requiredDocTypes?: DocType[];
}

export class OnboardOrganizationDto {
  @IsString() @MinLength(2) @MaxLength(120) orgName: string;
  @IsEmail() adminEmail: string;
  @IsOptional() @IsEmail() billingEmail?: string;
  @IsString() @MinLength(5) @MaxLength(25) phone: string;
  @IsString() @MaxLength(120) branchName: string;
  @IsString() @MinLength(2) @MaxLength(30) branchCode: string;
  @IsString() @MaxLength(200) addressLine1: string;
  @IsOptional() @IsString() @MaxLength(200) addressLine2?: string;
  @IsString() @MaxLength(80) city: string;
  @IsString() @MaxLength(12) postcode: string;
  @IsOptional() @IsString() @MaxLength(60) country?: string;
  @IsOptional() @IsString() @MaxLength(25) branchPhone?: string;
  @IsOptional() @IsEmail() managerEmail?: string;
  @IsOptional() @IsIn(MARKET_CODES) marketCode?: string;
}
