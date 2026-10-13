import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser } from './auth-user';
import { PermissionCode } from './permissions';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMS_KEY = 'permissions';
/** Требуются ВСЕ перечисленные разрешения */
export const RequirePermissions = (...perms: PermissionCode[]) => SetMetadata(PERMS_KEY, perms);

export const PERMS_ANY_KEY = 'permissionsAny';
/** Требуется ХОТЯ БЫ ОДНО из перечисленных разрешений */
export const RequireAnyPermission = (...perms: PermissionCode[]) => SetMetadata(PERMS_ANY_KEY, perms);

export const SKIP_AUDIT = 'skipAudit';
export const SkipAudit = () => SetMetadata(SKIP_AUDIT, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
