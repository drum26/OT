import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  pageSize?: number = 25;

  @IsOptional() @IsString()
  sortBy?: string;

  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageArgs(q: PageQuery) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/** Безопасный выбор поля сортировки из белого списка */
export function orderByFrom<T extends string>(q: PageQuery, allowed: Record<string, any>, fallback: any): any {
  if (q.sortBy && allowed[q.sortBy]) {
    const v = allowed[q.sortBy];
    return typeof v === 'function' ? v(q.sortDir ?? 'asc') : { [v]: q.sortDir ?? 'asc' };
  }
  return fallback;
}
