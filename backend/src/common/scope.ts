import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './auth-user';

/** Фильтр Prisma по разрешённым подразделениям пользователя (undefined — без ограничений) */
export function unitFilter(user: AuthUser): { in: string[] } | undefined {
  return user.unitIds === null ? undefined : { in: user.unitIds };
}

export function inScope(user: AuthUser, unitId: string | null | undefined): boolean {
  if (user.unitIds === null) return true;
  return !!unitId && user.unitIds.includes(unitId);
}

export function assertInScope(user: AuthUser, unitId: string | null | undefined, what = 'подразделению') {
  if (!inScope(user, unitId)) throw new ForbiddenException(`Нет доступа к ${what}`);
}

/** Пересечение запрошенного фильтра подразделений с разрешёнными */
export function narrowUnits(user: AuthUser, requested?: string[] | null): string[] | undefined {
  if (!requested || !requested.length) return user.unitIds === null ? undefined : user.unitIds;
  if (user.unitIds === null) return requested;
  return requested.filter((id) => user.unitIds!.includes(id));
}
