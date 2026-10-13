import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { EmptyToNull, IsDateOnly, IsOptionalDateOnly } from '../common/validation';
import { EventQuery } from '../briefings/briefings.dto';

export class CheckQuery extends EventQuery {
  @IsOptional() @IsIn(['PASSED', 'FAILED', 'ABSENT', 'PENDING']) outcome?: string;
  @IsOptional() @IsUUID() commissionId?: string;
}
export class CheckExportQuery extends CheckQuery {
  @IsOptional() @IsIn(['xlsx', 'csv', 'pdf', 'html']) format?: 'xlsx' | 'csv' | 'pdf' | 'html';
}

export class PlanCheckDto {
  @IsUUID() checkTypeId: string;
  @IsDateOnly() plannedDate: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) reason?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() commissionId?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() responsibleEmployeeId?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @IsArray() @ArrayMinSize(1, { message: 'Выберите хотя бы одного сотрудника' }) @ArrayMaxSize(2000) @ArrayUnique() @IsUUID('all', { each: true }) employeeIds: string[];
}

export class UpdateCheckPlanDto {
  @IsOptionalDateOnly() plannedDate?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) reason?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() commissionId?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() responsibleEmployeeId?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @ArrayUnique() @IsUUID('all', { each: true }) employeeIds?: string[];
}

export class CheckResultDto {
  @IsUUID() employeeId: string;
  @IsIn(['PASSED', 'FAILED', 'ABSENT']) outcome: 'PASSED' | 'FAILED' | 'ABSENT';
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) score?: string | null;
  @IsOptionalDateOnly() nextCheckDate?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) nextCheckBasis?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) comment?: string | null;
}

export class ConductCheckDto {
  @IsDateOnly() conductedDate: string;
  @EmptyToNull() @IsOptional() @IsUUID() commissionId?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() responsibleEmployeeId?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) protocolNumber?: string | null;
  @IsOptionalDateOnly() protocolDate?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(1000) reason?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => CheckResultDto) results: CheckResultDto[];
}

export class RegisterCheckDto extends ConductCheckDto {
  @IsUUID() checkTypeId: string;
}
