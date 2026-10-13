import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser, Public, SkipAudit } from '../common/decorators';
import { AuthUser } from '../common/auth-user';

class LoginDto {
  @IsString() @MinLength(1) @MaxLength(100) login: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}

class ChangePasswordDto {
  @IsString() @MaxLength(200) currentPassword: string;
  @IsString() @MinLength(10) @MaxLength(128) newPassword: string;
}

export const REFRESH_COOKIE = 'ot_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private config: ConfigService) {}

  private setCookie(res: Response, token: string, expires: Date) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE') === 'true',
      sameSite: 'strict',
      path: '/api/auth',
      expires,
    });
  }

  /** CSRF-защита cookie-эндпоинтов: обязательный пользовательский заголовок (не может быть отправлен кросс-доменной формой) */
  private requireCsrfHeader(req: Request) {
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') throw new UnauthorizedException('Отсутствует заголовок защиты от CSRF');
  }

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: Number(process.env.LOGIN_RATE_LIMIT ?? 10), ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const t = await this.auth.login(dto.login, dto.password, { ip: req.ip, userAgent: req.headers['user-agent'] });
    this.setCookie(res, t.refreshToken, t.refreshExpiresAt);
    return { accessToken: t.accessToken };
  }

  @Public()
  @SkipAudit()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.requireCsrfHeader(req);
    const t = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], { ip: req.ip, userAgent: req.headers['user-agent'] });
    this.setCookie(res, t.refreshToken, t.refreshExpiresAt);
    return { accessToken: t.accessToken };
  }

  @Public()
  @SkipAudit()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.requireCsrfHeader(req);
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }
}
