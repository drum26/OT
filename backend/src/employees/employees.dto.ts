import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';
import { EmptyToNull, IsDateOnly, IsOptionalDateOnly, Trim } from '../common/validation';

const NAME = /^[\p{L}][\p{L}\-' ]{0,99}$/u;
const NAME_MSG = { message: 'Допустимы буквы, дефис, апостроф и пробел' };

export class EmployeeQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',').filter(Boolean))) @IsArray() @IsUUID('all', { each: true }) unitIds?: string[];
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'ABSENT', 'DISMISSED', 'CURRENT', 'ALL']) status?: string;
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() includeChildren?: boolean;
}

export class CreateEmployeeDto {
  @Trim() @Matches(/^[\p{L}\d][\p{L}\d\-/._]{0,49}$/u, { message: 'Недопустимый табельный номер' }) personnelNumber: string;
  @Trim() @Matches(NAME, NAME_MSG) lastName: string;
  @Trim() @Matches(NAME, NAME_MSG) firstName: string;
  @EmptyToNull() @IsOptional() @Matches(NAME, NAME_MSG) middleName?: string | null;
  @IsUUID() unitId: string;
  @IsUUID() positionId: string;
  @IsDateOnly() hireDate: string;
  @EmptyToNull() @IsOptional() @IsUUID() managerId?: string | null;
  @EmptyToNull() @IsOptional() @Matches(/^[\d+\-() ]{3,30}$/, { message: 'Неверный формат телефона' }) phone?: string | null;
  @EmptyToNull() @IsOptional() @IsEmail({}, { message: 'Неверный email' }) email?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) orderNumber?: string | null;
}

export class UpdateEmployeeDto {
  @Trim() @IsOptional() @Matches(/^[\p{L}\d][\p{L}\d\-/._]{0,49}$/u, { message: 'Недопустимый табельный номер' }) personnelNumber?: string;
  @Trim() @IsOptional() @Matches(NAME, NAME_MSG) lastName?: string;
  @Trim() @IsOptional() @Matches(NAME, NAME_MSG) firstName?: string;
  @EmptyToNull() @IsOptional() @Matches(NAME, NAME_MSG) middleName?: string | null;
  @IsOptionalDateOnly() hireDate?: string;
  @EmptyToNull() @IsOptional() @IsUUID() managerId?: string | null;
  @EmptyToNull() @IsOptional() @Matches(/^[\d+\-() ]{3,30}$/, { message: 'Неверный формат телефона' }) phone?: string | null;
  @EmptyToNull() @IsOptional() @IsEmail({}, { message: 'Неверный email' }) email?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
}

export class TransferDto {
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsDateOnly() effectiveDate: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) orderNumber?: string | null;
}

export class DismissDto {
  @IsDateOnly() dismissalDate: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) orderNumber?: string | null;
}

export class StatusDto {
  @IsIn(['ACTIVE', 'ABSENT']) status: 'ACTIVE' | 'ABSENT';
  @IsDateOnly() effectiveDate: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
}

export class RehireDto {
  @IsDateOnly() hireDate: string;
  @IsUUID() unitId: string;
  @IsUUID() positionId: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) orderNumber?: string | null;
}

export class ImportOptionsDto {
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() updateExisting?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() createMissingUnits?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() createMissingPositions?: boolean;
}

void MinLength;

export class EmployeeExportQuery extends EmployeeQuery {
  @IsOptional() @IsIn(['xlsx', 'csv', 'pdf', 'html']) format?: 'xlsx' | 'csv' | 'pdf' | 'html';
}
