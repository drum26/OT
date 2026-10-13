import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, Matches, ValidateIf } from 'class-validator';
import { parseDateOnly } from './dates';

/** Дата в формате ГГГГ-ММ-ДД (обязательная) */
export function IsDateOnly() {
  return applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '$property: ожидается дата в формате ГГГГ-ММ-ДД' }),
    ValidateIf((_, v) => v !== undefined),
  );
}

/** Необязательная дата ГГГГ-ММ-ДД; пустая строка трактуется как null */
export function IsOptionalDateOnly() {
  return applyDecorators(
    Transform(({ value }) => (value === '' ? null : value)),
    IsOptional(),
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '$property: ожидается дата в формате ГГГГ-ММ-ДД' }),
  );
}

export function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return parseDateOnly(v);
}

/** Удаление пробелов по краям строк */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** Пустая строка → null */
export const EmptyToNull = () => Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value));
