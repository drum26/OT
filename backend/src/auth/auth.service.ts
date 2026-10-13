import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../core/audit.service';
import { UserContextService } from './user-context.service';

export const PASSWORD_POLICY = /^(?=.*[A-Za-zА-Яа-яЁё])(?=.*\d).{10,128}$/;
export const PASSWORD_POLICY_TEXT = 'Пароль должен содержать не менее 10 символов, буквы и цифры';

export function hashPassword(p: string) {
  return argon2.hash(p, { type: argon2.argon2id });
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

interface ClientInfo { ip?: string; userAgent?: string }

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
    private ctx: UserContextService,
  ) {}

  private get maxAttempts() { return Number(this.config.get('LOGIN_MAX_ATTEMPTS') ?? 5); }
  private get lockMinutes() { return Number(this.config.get('LOGIN_LOCK_MINUTES') ?? 15); }
  private get refreshDays() { return Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 7); }

  async login(login: string, password: string, client: ClientInfo) {
    const user = await this.prisma.user.findUnique({ where: { login: login.trim().toLowerCase() } });
    const fail = async (reason: string) => {
      await this.audit.log({ action: 'auth.login', userLogin: login.slice(0, 100), ip: client.ip, success: false, details: { reason } });
      return new UnauthorizedException('Неверный логин или пароль');
    };
    if (!user || !user.isActive) {
      // Выравнивание времени ответа, чтобы не раскрывать существование логина
      await argon2.hash(password || 'x').catch(() => null);
      throw await fail('unknown_or_inactive');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({ action: 'auth.login', userId: user.id, userLogin: user.login, ip: client.ip, success: false, details: { reason: 'locked' } });
      throw new UnauthorizedException(`Учётная запись временно заблокирована из-за неудачных попыток входа. Повторите позже.`);
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const attempts = user.failedLoginCount + 1;
      const lock = attempts >= this.maxAttempts;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: lock ? 0 : attempts, lockedUntil: lock ? new Date(Date.now() + this.lockMinutes * 60000) : undefined },
      });
      throw await fail(lock ? 'bad_password_locked' : 'bad_password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.audit.log({ action: 'auth.login', userId: user.id, userLogin: user.login, ip: client.ip });
    return this.issueTokens(user.id, randomUUID(), client);
  }

  private async issueTokens(userId: string, familyId: string, client: ClientInfo) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, typ: 'access' },
      { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m' },
    );
    const refreshToken = randomBytes(48).toString('base64url');
    const rec = await this.prisma.refreshToken.create({
      data: {
        userId, familyId, tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshDays * 86400000),
        ip: client.ip, userAgent: client.userAgent?.slice(0, 300),
      },
    });
    return { accessToken, refreshToken, refreshExpiresAt: rec.expiresAt, tokenId: rec.id };
  }

  /** Ротация refresh-токена. Повторное использование отозванного токена отзывает всю цепочку (защита от кражи). */
  async refresh(token: string | undefined, client: ClientInfo) {
    if (!token) throw new UnauthorizedException('Сессия не найдена');
    const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!rec) throw new UnauthorizedException('Сессия не найдена');
    if (rec.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: rec.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ action: 'auth.refresh_reuse', userId: rec.userId, ip: client.ip, success: false });
      throw new UnauthorizedException('Сессия недействительна, выполните вход повторно');
    }
    if (rec.expiresAt < new Date() || !rec.user.isActive) throw new UnauthorizedException('Сессия истекла');
    const next = await this.issueTokens(rec.userId, rec.familyId, client);
    await this.prisma.refreshToken.update({ where: { id: rec.id }, data: { revokedAt: new Date(), replacedBy: next.tokenId } });
    return next;
  }

  async logout(token: string | undefined) {
    if (!token) return;
    const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (rec) await this.prisma.refreshToken.updateMany({ where: { familyId: rec.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current).catch(() => false))) throw new BadRequestException('Текущий пароль указан неверно');
    if (!PASSWORD_POLICY.test(next)) throw new BadRequestException(PASSWORD_POLICY_TEXT);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    this.ctx.invalidate(userId);
  }

  async me(userId: string) {
    const ctx = await this.ctx.load(userId);
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mustChangePassword: true, email: true, allUnits: true } });
    return { ...ctx, ...u };
  }
}
