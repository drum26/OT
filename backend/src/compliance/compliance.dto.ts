import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';

const csv = () => Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : String(value).split(',').filter(Boolean)));

export class ComplianceQuery {
  @IsOptional() @csv() @IsArray() @IsUUID('all', { each: true }) unitIds?: string[];
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @csv() @IsArray() @IsIn(['OK', 'UPCOMING', 'OVERDUE', 'MISSING', 'FAILED'], { each: true }) statuses?: ('OK' | 'UPCOMING' | 'OVERDUE' | 'MISSING' | 'FAILED')[];
  @IsOptional() @IsIn(['xlsx', 'csv', 'pdf', 'html']) format?: 'xlsx' | 'csv' | 'pdf' | 'html';
}

export const COMPLIANCE_STATUS_RU: Record<string, string> = {
  OK: 'В норме', UPCOMING: 'Приближается срок', OVERDUE: 'Просрочено', MISSING: 'Нет сведений (просрочено)', FAILED: 'Неудовлетворительный результат',
};
