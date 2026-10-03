import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreateStaffUserDto {
  @IsEmail() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsIn(['ORG_ADMIN', 'FACILITY_MANAGER']) role: 'ORG_ADMIN' | 'FACILITY_MANAGER';

  /** Ignored for ORG_ADMIN: their own organization is always used. */
  @IsOptional() @IsUUID() organizationId?: string;

  /** Branch to manage (FACILITY_MANAGER only). */
  @IsOptional() @IsUUID() branchId?: string;
}

export class UpdateStaffUserDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
