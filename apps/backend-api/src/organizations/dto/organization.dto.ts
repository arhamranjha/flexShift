import { IsArray, IsEmail, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
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
