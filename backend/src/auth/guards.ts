import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC, PERMS_ANY_KEY, PERMS_KEY } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { UserContextService } from './user-context.service';

/** Проверка access-токена (Authorization: Bearer). Применяется глобально, кроме маршрутов @Public() */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private ctx: UserContextService, private config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Требуется авторизация');
    let payload: { sub: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7), { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') });
    } catch {
      throw new UnauthorizedException('Сессия истекла, выполните вход повторно');
    }
    if (payload.typ !== 'access') throw new UnauthorizedException('Неверный тип токена');
    const user = await this.ctx.load(payload.sub);
    if (!user) throw new UnauthorizedException('Учётная запись отключена');
    req.user = user;
    return true;
  }
}

/** Проверка разрешений RBAC на сервере */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const all = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const any = this.reflector.getAllAndOverride<string[]>(PERMS_ANY_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (!all.length && !any.length) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException();
    const has = new Set(user.permissions);
    if (all.some((p) => !has.has(p))) throw new ForbiddenException('Недостаточно прав для выполнения операции');
    if (any.length && !any.some((p) => has.has(p))) throw new ForbiddenException('Недостаточно прав для выполнения операции');
    return true;
  }
}

export function hasPermission(user: AuthUser, perm: string) {
  return user.permissions.includes(perm);
}
