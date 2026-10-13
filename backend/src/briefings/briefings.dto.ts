import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { PageQuery } from '../common/pagination';
import { EmptyToNull, IsDateOnly, IsOptionalDateOnly } from '../common/validation';

const csv = () => Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : String(value).split(',').filter(Boolean)));

export class EventQuery extends PageQuery {
  @IsOptional() @IsIn(['PLANNED', 'CONDUCTED', 'CANCELLED', 'OVERDUE']) status?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @csv() @IsArray() @IsUUID('all', { each: true }) unitIds?: string[];
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() responsibleId?: string;
  @IsOptionalDateOnly() dateFrom?: string;
  @IsOptionalDateOnly() dateTo?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
}

export class EventExportQuery extends EventQuery {
  @IsOptional() @IsIn(['xlsx', 'csv', 'pdf', 'html']) format?: 'xlsx' | 'csv' | 'pdf' | 'html';
}

export class PlanBriefingDto {
  @IsUUID() briefingTypeId: string;
  @IsDateOnly() plannedDate: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) topic?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) reason?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() documentId?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() responsibleEmployeeId?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @IsArray() @ArrayMinSize(1, { message: 'Выберите хотя бы одного сотрудника' }) @ArrayMaxSize(2000) @ArrayUnique() @IsUUID('all', { each: true }) employeeIds: string[];
}

export class UpdatePlanDto {
  @IsOptionalDateOnly() plannedDate?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) topic?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) reason?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() documentId?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() responsibleEmployeeId?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @ArrayUnique() @IsUUID('all', { each: true }) employeeIds?: string[];
}

export class ParticipantResultDto {
  @IsUUID() employeeId: string;
  @IsIn(['COMPLETED', 'NOT_COMPLETED', 'ABSENT']) result: 'COMPLETED' | 'NOT_COMPLETED' | 'ABSENT';
  @IsOptional() @IsBoolean() confirmed?: boolean;
  @IsOptional() @IsIn(['PAPER_JOURNAL_SIGNATURE', 'SCANNED_DOCUMENT', 'ELECTRONIC', 'OTHER']) confirmationMethod?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) confirmationNote?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class ConductDto {
  @IsDateOnly() conductedDate: string;
  @IsUUID() responsibleEmployeeId: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) topic?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) reason?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() documentId?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => ParticipantResultDto) participants: ParticipantResultDto[];
}

/** Регистрация уже проведённого инструктажа без предварительного планирования */
export class RegisterBriefingDto extends ConductDto {
  @IsUUID() briefingTypeId: string;
}

export class ConfirmDto {
  @IsArray() @ArrayMinSize(1) @IsUUID('all', { each: true }) participantIds: string[];
  @IsIn(['PAPER_JOURNAL_SIGNATURE', 'SCANNED_DOCUMENT', 'ELECTRONIC', 'OTHER']) method: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class CancelDto {
  @IsString() @MaxLength(1000) reason: string;
}
