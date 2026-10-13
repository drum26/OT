import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Настройки с описанием и значением по умолчанию. Нормативные сроки сюда НЕ входят — они задаются в правилах. */
export const SETTINGS_DEFAULTS: Record<string, { value: unknown; description: string }> = {
  'organization.name': { value: '', description: 'Наименование организации (для печатных форм)' },
  'deadlines.upcomingDays': { value: 30, description: 'Горизонт «предстоящих» мероприятий на панели, дней' },
  'ppe.replacementWarningDays': { value: 14, description: 'За сколько дней до плановой замены СИЗ считать её предстоящей' },
  'ppe.enforceStock': { value: false, description: 'Запрещать выдачу СИЗ со склада при недостаточном остатке' },
  'knowledgeChecks.requireProtocol': { value: true, description: 'Требовать номер и дату протокола при регистрации результатов проверки' },
  'briefings.requireDocument': { value: false, description: 'Требовать указания инструкции/документа при регистрации инструктажа' },
  'briefings.requireTopic': { value: false, description: 'Требовать тему при регистрации инструктажа' },
  'notifications.digestEnabled': { value: true, description: 'Ежедневные сводные уведомления о несоответствиях по правилам' },
  'personalData.retentionYears': { value: null, description: 'Срок хранения данных уволенных сотрудников, лет (определяется организацией по применимым требованиям; пусто — не задан)' },
};

@Injectable()
export class SettingsService {
  private cache: { at: number; map: Map<string, unknown> } | null = null;
  constructor(private prisma: PrismaService) {}

  async all(): Promise<Record<string, unknown>> {
    if (!this.cache || Date.now() - this.cache.at > 10_000) {
      const rows = await this.prisma.systemSetting.findMany();
      this.cache = { at: Date.now(), map: new Map(rows.map((r) => [r.key, r.value])) };
    }
    const out: Record<string, unknown> = {};
    for (const [k, d] of Object.entries(SETTINGS_DEFAULTS)) out[k] = this.cache.map.has(k) ? this.cache.map.get(k) : d.value;
    for (const [k, v] of this.cache.map) if (!(k in out)) out[k] = v;
    return out;
  }

  async get<T = unknown>(key: string): Promise<T> {
    const a = await this.all();
    return a[key] as T;
  }

  async set(key: string, value: unknown, userId?: string) {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, description: SETTINGS_DEFAULTS[key]?.description, updatedById: userId },
      update: { value: value as Prisma.InputJsonValue, updatedById: userId },
    });
    this.cache = null;
  }
}
