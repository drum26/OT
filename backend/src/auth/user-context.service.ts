import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UnitTreeService } from '../core/unit-tree.service';
import { AuthUser } from '../common/auth-user';

/** Загрузка контекста пользователя: роли, разрешения и разрешённые подразделения (с коротким кэшем) */
@Injectable()
export class UserContextService {
  private cache = new Map<string, { at: number; user: AuthUser | null }>();
  private readonly ttlMs = 5_000;

  constructor(private prisma: PrismaService, private tree: UnitTreeService) {}

  invalidate(userId?: string) {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }

  async load(userId: string): Promise<AuthUser | null> {
    const c = this.cache.get(userId);
    if (c && Date.now() - c.at < this.ttlMs) return c.user;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, unitScopes: true },
    });
    let user: AuthUser | null = null;
    if (u && u.isActive) {
      const perms = new Set<string>();
      for (const ur of u.roles) for (const rp of ur.role.permissions) perms.add(rp.permission.code);
      user = {
        id: u.id,
        login: u.login,
        fullName: u.fullName,
        employeeId: u.employeeId,
        roles: u.roles.map((r) => r.role.code),
        permissions: [...perms],
        unitIds: u.allUnits ? null : await this.tree.withDescendants(u.unitScopes.map((s) => s.unitId)),
      };
    }
    this.cache.set(userId, { at: Date.now(), user });
    return user;
  }
}
