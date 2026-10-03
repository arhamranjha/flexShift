import { Transform } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf,
} from 'class-validator';
import { DocStatus, DocType } from '@prisma/client';

const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class WorkerQueryDto {
  @IsOptional() @IsString() @MaxLength(60) profession?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isVerified?: boolean;
  @IsOptional() @IsString() @MaxLength(60) systemTag?: string;
  @IsOptional() @IsString() @MaxLength(60) accreditation?: string;
  @IsOptional() @IsString() @MaxLength(60) search?: string;
}

export class LookupQueryDto {
  @IsString() @MinLength(3) @MaxLength(30) registrationNumber: string;
}

export class ConciergeWorkerDto {
  @IsEmail() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;
  @IsString() @MinLength(1) @MaxLength(60) firstName: string;
  @IsString() @MinLength(1) @MaxLength(60) lastName: string;
  @IsString() @MinLength(5) @MaxLength(25) phone: string;
  @IsString() @MinLength(3) @MaxLength(30) registrationNumber: string;
  @IsOptional() @IsString() @MaxLength(60) profession?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) hourlyRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) minimumShiftRate?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) systemTags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) accreditations?: string[];
  @IsOptional() @IsString() @MaxLength(120) university?: string;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) graduationYear?: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) yearsCommunityExperience?: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) yearsHospitalExperience?: number;
}

/** Multipart form fields (all strings on the wire) sent alongside the `file` part. */
export class UploadDocumentDto {
  @IsEnum(DocType) type: DocType;
  @IsOptional() @IsString() @MaxLength(100) documentReference?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class VerifyDocumentDto {
  @IsIn([DocStatus.VERIFIED, DocStatus.REJECTED]) status: 'VERIFIED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class DocumentQueueQueryDto {
  @IsOptional() @IsEnum(DocStatus) status?: DocStatus;
}

export class UpdatePreferencesDto {
  /** null removes the threshold / standard rate. */
  @ValidateIf((o) => o.minimumShiftRate !== undefined && o.minimumShiftRate !== null) @IsNumber() @Min(0) @Max(1000)
  minimumShiftRate?: number | null;
  @ValidateIf((o) => o.hourlyRate !== undefined && o.hourlyRate !== null) @IsNumber() @Min(0) @Max(1000)
  hourlyRate?: number | null;
  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) systemTags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) accreditations?: string[];
}
