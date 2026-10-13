import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { EmptyToNull, IsDateOnly, IsOptionalDateOnly, Trim } from '../common/validation';

export class TypeDto {
  @Trim() @Matches(/^[A-Za-z0-9_-]{1,50}$/, { message: 'Код: латиница, цифры, _ -' }) code: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(300) name: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class BriefingTypeDto extends TypeDto {
  @IsOptional() @IsBoolean() isPeriodic?: boolean;
  @IsOptional() @IsBoolean() requiresConfirmation?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}
export class UpdateBriefingTypeDto extends PartialType(BriefingTypeDto) {}
export class UpdateTypeDto extends PartialType(TypeDto) {}

export class RuleDto {
  @IsUUID() typeId: string;
  @EmptyToNull() @IsOptional() @IsUUID() positionId?: string | null;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(200) workCategory?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() unitId?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(240) periodMonths?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(3650) periodDays?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(3650) initialDueDays?: number | null;
  @IsOptional() @IsBoolean() resetOnTransfer?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(3650) retestDays?: number | null;
  @Trim() @IsString() @MinLength(3, { message: 'Укажите основание правила (документ, пункт, редакция)' }) @MaxLength(2000) basis: string;
  @IsDateOnly() validFrom: string;
  @IsOptionalDateOnly() validTo?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
}
export class UpdateRuleDto extends PartialType(RuleDto) {}

export class DocumentDto {
  @IsIn(['INSTRUCTION', 'PROGRAM', 'ORDER', 'REGULATION', 'OTHER']) docType: 'INSTRUCTION' | 'PROGRAM' | 'ORDER' | 'REGULATION' | 'OTHER';
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) number?: string | null;
  @Trim() @IsString() @MinLength(1) @MaxLength(500) title: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) version?: string | null;
  @IsOptionalDateOnly() approvedDate?: string | null;
  @IsOptionalDateOnly() validFrom?: string | null;
  @IsOptionalDateOnly() validTo?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
}
export class UpdateDocumentDto extends PartialType(DocumentDto) {}

export class CommissionMemberDto {
  @IsUUID() employeeId: string;
  @IsIn(['CHAIR', 'DEPUTY', 'MEMBER', 'SECRETARY']) role: 'CHAIR' | 'DEPUTY' | 'MEMBER' | 'SECRETARY';
}
export class CommissionDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(300) name: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(100) orderNumber?: string | null;
  @IsOptionalDateOnly() orderDate?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ArrayUnique((m: CommissionMemberDto) => m.employeeId) @ValidateNested({ each: true }) @Type(() => CommissionMemberDto) members: CommissionMemberDto[];
}
export class UpdateCommissionDto extends PartialType(CommissionDto) {}
