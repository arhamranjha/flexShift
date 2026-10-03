import { Transform } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MARKET_CODES } from '../../common/markets';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class LoginDto {
  @IsEmail() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString() @MaxLength(128)
  password: string;
}

export class RegisterReliefWorkerDto {
  @IsEmail() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString() @MinLength(8) @MaxLength(128)
  password: string;

  @IsString() @MinLength(1) @MaxLength(60) @Transform(trim)
  firstName: string;

  @IsString() @MinLength(1) @MaxLength(60) @Transform(trim)
  lastName: string;

  @IsString() @MinLength(5) @MaxLength(25) @Transform(trim)
  phone: string;

  @IsString() @MinLength(3) @MaxLength(30) @Transform(trim)
  registrationNumber: string;

  @IsOptional() @IsString() @MaxLength(60)
  profession?: string;

  /** Where the worker is registered (selects registration wording); defaults to the platform default market. */
  @IsOptional() @IsIn(MARKET_CODES)
  country?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  hourlyRate?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  minimumShiftRate?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  systemTags?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  accreditations?: string[];
}

export class ChangePasswordDto {
  @IsString() @MaxLength(128)
  currentPassword: string;

  @IsString() @MinLength(8) @MaxLength(128)
  newPassword: string;
}
