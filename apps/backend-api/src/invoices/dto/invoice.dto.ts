import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { InvoiceStatus } from '@prisma/client';

export class MarkPaidDto {
  @IsString() @MinLength(3) @MaxLength(100) paymentReference: string;
}

export class InvoiceQueryDto {
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
}
