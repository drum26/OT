import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PageQuery } from '../common/pagination';
import { EmptyToNull, IsDateOnly, IsOptionalDateOnly, Trim } from '../common/validation';

const csv = () => Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : String(value).split(',').filter(Boolean)));
const METHODS = ['PAPER_JOURNAL_SIGNATURE', 'SCANNED_DOCUMENT', 'ELECTRONIC', 'OTHER'];

export class PpeItemDto {
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) code?: string | null;
  @Trim() @IsString() @MinLength(1) @MaxLength(300) name: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(200) category: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(300) model?: string | null;
  @Trim() @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @IsOptional() @IsIn(['NONE', 'CLOTHING', 'SHOES', 'HEAD', 'HANDS', 'RESPIRATORY', 'OTHER']) sizeType?: any;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) characteristics?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(240) defaultWearMonths?: number | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) basis?: string | null;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: 'ACTIVE' | 'ARCHIVED';
}
export class UpdatePpeItemDto extends PartialType(PpeItemDto) {}

export class PpeStandardDto {
  @IsUUID() positionId: string;
  @IsUUID() ppeItemId: string;
  @IsInt() @Min(1) @Max(1000) quantity: number;
  @Trim() @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @IsOptional() @IsInt() @Min(1) @Max(240) wearMonths?: number | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(300) wearCondition?: string | null;
  @Trim() @IsString() @MinLength(3, { message: 'Укажите основание нормы' }) @MaxLength(2000) basis: string;
  @IsDateOnly() validFrom: string;
  @IsOptionalDateOnly() validTo?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
}
export class UpdatePpeStandardDto extends PartialType(PpeStandardDto) {}

export class StandardQuery {
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() ppeItemId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() activeOnly?: boolean;
}

export class IssueQuery extends PageQuery {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() ppeItemId?: string;
  @IsOptional() @csv() @IsArray() @IsUUID('all', { each: true }) unitIds?: string[];
  @IsOptional() @IsIn(['ACTIVE', 'PARTIALLY_CLOSED', 'RETURNED', 'WRITTEN_OFF', 'REPLACED', 'OPEN']) status?: string;
  @IsOptional() @IsIn(['true', 'false']) confirmed?: string;
  @IsOptional() @IsIn(['overdue', 'due']) replacement?: string;
  @IsOptionalDateOnly() dateFrom?: string;
  @IsOptionalDateOnly() dateTo?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
}
export class IssueExportQuery extends IssueQuery {
  @IsOptional() @IsIn(['xlsx', 'csv', 'pdf', 'html']) format?: 'xlsx' | 'csv' | 'pdf' | 'html';
}

export class NeedsQuery {
  @IsOptional() @csv() @IsArray() @IsUUID('all', { each: true }) unitIds?: string[];
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() ppeItemId?: string;
  @IsOptional() @csv() @IsArray() @IsString({ each: true }) statuses?: string[];
  @IsOptional() @IsIn(['xlsx', 'csv', 'pdf', 'html']) format?: 'xlsx' | 'csv' | 'pdf' | 'html';
}

export class IssueDto {
  @IsUUID() employeeId: string;
  @IsUUID() ppeItemId: string;
  @EmptyToNull() @IsOptional() @IsUUID() standardId?: string | null;
  @IsInt() @Min(1) @Max(1000) quantity: number;
  @IsDateOnly() issueDate: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) size?: string | null;
  /** Срок носки, мес. Если не указан — берётся из нормы / справочника */
  @IsOptional() @IsInt() @Min(1) @Max(240) wearMonths?: number | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) basis?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(300) issuerName?: string | null;
  @IsOptional() @IsBoolean() receiptConfirmed?: boolean;
  @IsOptional() @IsIn(METHODS) receiptMethod?: string | null;
  /** Списать со складского остатка */
  @IsOptional() @IsBoolean() fromStock?: boolean;
}

export class ConfirmReceiptDto {
  @IsIn(METHODS) method: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class ReplacementDateDto {
  @IsOptionalDateOnly() date?: string | null;
  @Trim() @IsString() @MinLength(3, { message: 'Укажите основание корректировки' }) @MaxLength(1000) basis: string;
}

export class ReturnDto {
  @IsIn(['RETURN', 'WRITE_OFF', 'REPLACEMENT']) operationType: 'RETURN' | 'WRITE_OFF' | 'REPLACEMENT';
  @IsInt() @Min(1) @Max(1000) quantity: number;
  @IsDateOnly() operationDate: string;
  @Trim() @IsString() @MinLength(3, { message: 'Укажите основание операции' }) @MaxLength(1000) reason: string;
  @IsOptional() @IsBoolean() toStock?: boolean;
  /** Для замены: параметры новой выдачи */
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) newSize?: string | null;
  @IsOptional() @IsBoolean() newFromStock?: boolean;
  @IsOptional() @IsBoolean() newReceiptConfirmed?: boolean;
  @IsOptional() @IsIn(METHODS) newReceiptMethod?: string | null;
}

export class StockOperationDto {
  @IsUUID() ppeItemId: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) size?: string | null;
  @IsInt() @Min(-100000) @Max(100000) quantity: number;
  @IsIn(['RECEIPT', 'ADJUSTMENT', 'WRITE_OFF']) movementType: 'RECEIPT' | 'ADJUSTMENT' | 'WRITE_OFF';
  @IsDateOnly() movementDate: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(300) document?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class ImportModeDto {
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() dryRun?: boolean;
}
