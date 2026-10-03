import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { DocumentShareStatus, StaffBankTier } from '@prisma/client';

/** Name the organization by id (from a shift the worker saw) or by the code the organization handed out. */
export class CreateDocumentShareDto {
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsString() @MaxLength(20) @Matches(/^[A-Za-z0-9-]+$/, { message: 'organizationCode must be letters, digits or hyphens' })
  organizationCode?: string;
}

export class DocumentShareQueryDto {
  /** Super admins only; everyone else always sees their own organization. */
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsEnum(DocumentShareStatus) status?: DocumentShareStatus;
}

export class AcceptDocumentShareDto {
  @IsOptional() @IsEnum(StaffBankTier) tier?: StaffBankTier;
  /** Limit the membership to one branch. Facility managers always add to their own branch. */
  @IsOptional() @IsUUID() branchId?: string;
}
