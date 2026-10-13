import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { SKIP_AUDIT } from '../common/decorators';
import { AuditService } from './audit.service';

/** Автоматическое журналирование всех изменяющих запросов (POST/PUT/PATCH/DELETE) */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService, private reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT, [ctx.getHandler(), ctx.getClass()]);
    if (req.method === 'GET' || skip) return next.handle();
    const route: string = req.route?.path ?? req.path;
    const entityType = route.replace(/^\/api\//, '').split('/')[0];
    const base = {
      userId: req.user?.id, userLogin: req.user?.login, method: req.method, path: req.originalUrl?.split('?')[0], ip: req.ip,
      action: `${req.method} ${route}`, entityType,
    };
    const body = req.body && !Buffer.isBuffer(req.body) ? req.body : undefined;
    return next.handle().pipe(
      tap({
        next: (res: any) => {
          const entityId = req.params?.id ?? (res && typeof res === 'object' && typeof res.id === 'string' ? res.id : null);
          void this.audit.log({ ...base, entityId, details: { params: req.params, body } });
        },
        error: (err: any) => {
          void this.audit.log({ ...base, entityId: req.params?.id, success: false, details: { params: req.params, body, error: err?.message, status: err?.status } });
        },
      }),
    );
  }
}
