import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, PASSWORD_POLICY, PASSWORD_POLICY_TEXT } from '../auth/auth.service';
import { UserContextService } from '../auth/user-context.service';
import { badRequest, notFound } from '../common/errors';
import { pageArgs } from '../common/pagination';
import type { CreateUserDto, RoleDto, UpdateRoleDto, UpdateUserDto, UserQuery } from './users.controller';

const userSelect = {
  id: true, login: true, fullName: true, email: true, isActive: true, allUnits: true, employeeId: true,
  lastLoginAt: true, lockedUntil: true, mustChangePassword: true, createdAt: true, updatedAt: true,
  roles: { select: { role: { select: { id: true, code: true, name: true } } } },
  unitScopes: { select: { unit: { select: { id: true, name: true } } } },
  employee: { select: { id: true, personnelNumber: true, lastName: true, firstName: true, middleName: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private ctx: UserContextService) {}

  async list(q: UserQuery) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where: Prisma.UserWhereInput = q.search
      ? { OR: [{ login: { contains: q.search, mode: 'insensitive' } }, { fullName: { contains: q.search, mode: 'insensitive' } }] }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: userSelect, skip, take, orderBy: { fullName: 'asc' } }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!u) throw notFound('Пользователь');
    return u;
  }

  async create(dto: CreateUserDto) {
    if (!PASSWORD_POLICY.test(dto.password)) throw badRequest(PASSWORD_POLICY_TEXT);
    const u = await this.prisma.user.create({
      data: {
        login: dto.login.toLowerCase(),
        fullName: dto.fullName,
        email: dto.email ?? null,
        passwordHash: await hashPassword(dto.password),
        allUnits: dto.allUnits ?? false,
        employeeId: dto.employeeId ?? null,
        mustChangePassword: true,
        roles: { create: dto.roleIds.map((roleId) => ({ roleId })) },
        unitScopes: { create: (dto.unitIds ?? []).map((unitId) => ({ unitId })) },
      },
      select: userSelect,
    });
    return u;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.get(id);
    const u = await this.prisma.$transaction(async (tx) => {
      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: dto.roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      if (dto.unitIds) {
        await tx.userUnitScope.deleteMany({ where: { userId: id } });
        await tx.userUnitScope.createMany({ data: dto.unitIds.map((unitId) => ({ userId: id, unitId })) });
      }
      if (dto.isActive === false) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return tx.user.update({
        where: { id },
        data: { fullName: dto.fullName, email: dto.email, isActive: dto.isActive, allUnits: dto.allUnits, employeeId: dto.employeeId },
        select: userSelect,
      });
    });
    this.ctx.invalidate(id);
    return u;
  }

  async resetPassword(id: string, password: string, mustChange: boolean) {
    if (!PASSWORD_POLICY.test(password)) throw badRequest(PASSWORD_POLICY_TEXT);
    await this.get(id);
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: mustChange, failedLoginCount: 0, lockedUntil: null } });
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async unlock(id: string) {
    await this.prisma.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
    return { ok: true };
  }

  roles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { select: { permission: { select: { code: true } } } }, _count: { select: { users: true } } },
    }).then((rs) => rs.map((r) => ({ ...r, permissions: r.permissions.map((p) => p.permission.code) })));
  }

  permissions() {
    return this.prisma.permission.findMany({ orderBy: [{ groupName: 'asc' }, { name: 'asc' }] });
  }

  private async permIds(codes: string[]) {
    const ps = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    if (ps.length !== new Set(codes).size) throw badRequest('Указаны неизвестные разрешения');
    return ps.map((p) => p.id);
  }

  async createRole(dto: RoleDto) {
    const ids = await this.permIds(dto.permissions);
    return this.prisma.role.create({
      data: { code: dto.code, name: dto.name, description: dto.description, permissions: { create: ids.map((permissionId) => ({ permissionId })) } },
    });
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw notFound('Роль');
    if (role.code === 'ADMIN' && dto.permissions && !dto.permissions.includes('roles.manage')) {
      throw badRequest('У роли администратора нельзя отключить управление ролями');
    }
    const r = await this.prisma.$transaction(async (tx) => {
      if (dto.permissions) {
        const ids = await this.permIds(dto.permissions);
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId: id, permissionId })) });
      }
      return tx.role.update({ where: { id }, data: { name: dto.name, description: dto.description } });
    });
    this.ctx.invalidate();
    return r;
  }
}
