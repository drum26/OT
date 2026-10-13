import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SECRET_KEY_RE = /pass(word)?|token|secret|hash|authorization|cookie/i;

/** Удаление секретов (пароли, токены) из данных, попадающих в журнал */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[…]';
  if (Array.isArray(value)) {
    const arr = value.slice(0, 50).map((v) => sanitize(v, depth + 1));
    if (value.length > 50) arr.push(`[ещё ${value.length - 50}]`);
    return arr;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? '***' : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 1000) return value.slice(0, 1000) + '…';
  return value;
}

export interface AuditEntry {
  userId?: string | null;
  userLogin?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  method?: string;
  path?: string;
  ip?: string;
  success?: boolean;
  details?: unknown;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private prisma: PrismaService) {}

  async log(e: AuditEntry) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: e.userId ?? null,
          userLogin: e.userLogin ?? null,
          action: e.action,
          entityType: e.entityType ?? null,
          entityId: e.entityId ?? null,
          method: e.method,
          path: e.path,
          ip: e.ip,
          success: e.success ?? true,
          details: e.details === undefined ? undefined : (sanitize(e.details) as Prisma.InputJsonValue),
        },
      });
    } catch (err) {
      // Ошибка записи журнала не должна прерывать основную операцию
      this.logger.error(`Не удалось записать журнал: ${(err as Error).message}`);
    }
  }
}
