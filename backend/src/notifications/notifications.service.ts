import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationEventType, NotificationRule, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UnitTreeService } from '../core/unit-tree.service';
import { SettingsService } from '../core/settings.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AuthUser } from '../common/auth-user';
import { addDays, formatRu, todayInTz } from '../common/dates';
import { fullName } from '../employees/employees.service';
import { EmailChannel, InAppChannel, NotificationChannel } from './channels';
import { notificationStage, stageText } from './notification.logic';

interface Recipient { id: string; unitIds: string[] | null; roles: string[]; employeeId: string | null }

export interface NotifyInput {
  eventType: NotificationEventType;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  dedupeKey: string;
}

const SYSTEM_USER: AuthUser = { id: 'system', login: 'system', fullName: 'Система', employeeId: null, roles: [], permissions: [], unitIds: null };
const LOCK_ID = 7_340_001;

@Injectable()
export class NotificationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Notifications');
  private channels: Map<string, NotificationChannel>;

  constructor(
    private prisma: PrismaService,
    private tree: UnitTreeService,
    private settings: SettingsService,
    private compliance: ComplianceService,
    inApp: InAppChannel,
    email: EmailChannel,
  ) {
    this.channels = new Map<string, NotificationChannel>([[inApp.name, inApp], [email.name, email]]);
  }

  onApplicationBootstrap() {
    if (process.env.SCHEDULER_ENABLED === 'false') return;
    setTimeout(() => void this.runScheduled(), 15_000);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runScheduled() {
    if (process.env.SCHEDULER_ENABLED === 'false') return;
    try {
      await this.generate();
    } catch (e) {
      this.logger.error(`Ошибка фонового задания уведомлений: ${(e as Error).message}`);
    }
  }

  /** Создание уведомлений (идемпотентно: уникальность userId + dedupeKey) и попытки доставки */
  async notify(userIds: string[], n: NotifyInput, channels: string[]): Promise<number> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return 0;
    const created = await this.prisma.notification.createManyAndReturn({
      data: ids.map((userId) => ({ userId, ...n })),
      skipDuplicates: true,
      select: { id: true },
    });
    if (created.length) {
      await this.prisma.notificationDelivery.createMany({
        data: created.flatMap((c) => (channels.length ? channels : ['IN_APP']).map((channel) => ({ notificationId: c.id, channel }))),
        skipDuplicates: true,
      });
    }
    return created.length;
  }

  /** Доставка ожидающих уведомлений по каналам с фиксацией статуса и ошибок */
  async deliverPending() {
    const pending = await this.prisma.notificationDelivery.findMany({
      where: { OR: [{ status: 'PENDING' }, { status: 'FAILED', attempts: { lt: 3 } }] },
      include: { notification: { include: { user: { select: { id: true, email: true, fullName: true } } } } },
      take: 2000,
    });
    let sent = 0, failed = 0;
    for (const d of pending) {
      const ch = this.channels.get(d.channel);
      if (!ch || !ch.isConfigured()) {
        await this.prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: 'SKIPPED', lastError: 'Канал не настроен', attempts: { increment: 1 } } });
        continue;
      }
      try {
        await ch.send({ id: d.notificationId, title: d.notification.title, message: d.notification.message, link: d.notification.link, user: d.notification.user });
        await this.prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, lastError: null } });
        sent++;
      } catch (e) {
        await this.prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: 'FAILED', lastError: (e as Error).message.slice(0, 500), attempts: { increment: 1 } } });
        failed++;
      }
    }
    return { sent, failed };
  }

  private async recipients(): Promise<Recipient[]> {
    const users = await this.prisma.user.findMany({ where: { isActive: true }, include: { roles: { include: { role: true } }, unitScopes: true } });
    return Promise.all(users.map(async (u) => ({
      id: u.id, employeeId: u.employeeId, roles: u.roles.map((r) => r.role.code),
      unitIds: u.allUnits ? null : await this.tree.withDescendants(u.unitScopes.map((s) => s.unitId)),
    })));
  }

  private pick(all: Recipient[], rule: NotificationRule, unitIds: string[], responsibleEmployeeId?: string | null, extraRoles: string[] = []) {
    const covers = (r: Recipient) => r.unitIds === null || unitIds.some((u) => r.unitIds!.includes(u));
    const out: string[] = [];
    for (const r of all) {
      if (rule.notifySafetySpecialists && (r.roles.includes('SAFETY_SPECIALIST') || extraRoles.some((x) => r.roles.includes(x))) && covers(r)) out.push(r.id);
      // Руководителю подразделения — только при явном ограничении зоны (иначе это не руководитель конкретного подразделения)
      if (rule.notifyUnitHeads && r.roles.includes('UNIT_HEAD') && r.unitIds !== null && covers(r)) out.push(r.id);
      if (rule.notifyResponsible && responsibleEmployeeId && r.employeeId === responsibleEmployeeId) out.push(r.id);
    }
    return out;
  }

  async generate() {
    const lock = await this.prisma.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_ID}) AS ok`;
    if (!lock[0]?.ok) return { skipped: 'Задание уже выполняется' };
    try {
      const stats: Record<string, number> = {};
      const rules = new Map((await this.prisma.notificationRule.findMany({ where: { isActive: true } })).map((r) => [r.eventType, r]));
      const recipients = await this.recipients();
      const today = todayInTz();
      const maxBefore = (r?: NotificationRule) => Math.max(0, ...(r?.daysBefore ?? [0]));

      // Плановые инструктажи
      const br = rules.get('BRIEFING_PLANNED');
      if (br) {
        let n = 0;
        const list = await this.prisma.briefing.findMany({
          where: { status: 'PLANNED', plannedDate: { lte: addDays(today, maxBefore(br)) } },
          include: { briefingType: { select: { name: true } }, participants: { select: { unitId: true } } },
        });
        for (const b of list) {
          const stage = notificationStage(b.plannedDate!, today, br);
          if (!stage) continue;
          const units = [...new Set(b.participants.map((p) => p.unitId))];
          n += await this.notify(this.pick(recipients, br, units, b.responsibleEmployeeId), {
            eventType: 'BRIEFING_PLANNED', title: `Инструктаж: ${b.briefingType.name}`,
            message: `${stageText(stage, formatRu(b.plannedDate))}. Участников: ${b.participants.length}.`,
            link: `/briefings/${b.id}`, entityType: 'briefing', entityId: b.id, dedupeKey: `briefing:${b.id}:${stage}:${b.plannedDate!.toISOString().slice(0, 10)}`,
          }, br.channels);
          if (stage === 'overdue' && br.createTaskOnOverdue) await this.autoTask(`briefing-overdue:${b.id}`, 'AUTO_BRIEFING', `Провести просроченный инструктаж: ${b.briefingType.name}`, b.plannedDate!, 'briefing', b.id, units[0], recipients, b.responsibleEmployeeId);
        }
        stats.briefings = n;
      }

      // Плановые проверки знаний
      const cr = rules.get('KNOWLEDGE_CHECK_PLANNED');
      if (cr) {
        let n = 0;
        const list = await this.prisma.knowledgeCheck.findMany({
          where: { status: 'PLANNED', plannedDate: { lte: addDays(today, maxBefore(cr)) } },
          include: { checkType: { select: { name: true } }, participants: { select: { unitId: true } } },
        });
        for (const c of list) {
          const stage = notificationStage(c.plannedDate!, today, cr);
          if (!stage) continue;
          const units = [...new Set(c.participants.map((p) => p.unitId))];
          n += await this.notify(this.pick(recipients, cr, units, c.responsibleEmployeeId), {
            eventType: 'KNOWLEDGE_CHECK_PLANNED', title: `Проверка знаний: ${c.checkType.name}`,
            message: `${stageText(stage, formatRu(c.plannedDate))}. Участников: ${c.participants.length}.`,
            link: `/checks/${c.id}`, entityType: 'knowledge_check', entityId: c.id, dedupeKey: `check:${c.id}:${stage}:${c.plannedDate!.toISOString().slice(0, 10)}`,
          }, cr.channels);
          if (stage === 'overdue' && cr.createTaskOnOverdue) await this.autoTask(`check-overdue:${c.id}`, 'AUTO_CHECK', `Провести просроченную проверку знаний: ${c.checkType.name}`, c.plannedDate!, 'knowledge_check', c.id, units[0], recipients, c.responsibleEmployeeId);
        }
        stats.checks = n;
      }

      // Плановая замена СИЗ (сводно по подразделению и дате)
      const pr = rules.get('PPE_REPLACEMENT');
      if (pr) {
        let n = 0;
        const list = await this.prisma.ppeIssue.findMany({
          where: { status: { in: ['ACTIVE', 'PARTIALLY_CLOSED'] }, plannedReplacementDate: { lte: addDays(today, maxBefore(pr)) }, employee: { status: { not: 'DISMISSED' } } },
          include: { employee: { select: { unitId: true, lastName: true, firstName: true, middleName: true } }, ppeItem: { select: { name: true } } },
        });
        const groups = new Map<string, typeof list>();
        for (const i of list) {
          const stage = notificationStage(i.plannedReplacementDate!, today, pr);
          if (!stage) continue;
          const key = `${i.employee.unitId}|${i.plannedReplacementDate!.toISOString().slice(0, 10)}|${stage}`;
          groups.set(key, [...(groups.get(key) ?? []), i]);
          if (stage === 'overdue' && pr.createTaskOnOverdue) await this.autoTask(`ppe-overdue:${i.id}`, 'AUTO_PPE', `Замена СИЗ: ${i.ppeItem.name} — ${fullName(i.employee)}`, i.plannedReplacementDate!, 'ppe_issue', i.id, i.employee.unitId, recipients, null, ['PPE_OFFICER']);
        }
        const names = await this.tree.names();
        for (const [key, items] of groups) {
          const [unitId, date, stage] = key.split('|');
          n += await this.notify(this.pick(recipients, pr, [unitId], null, ['PPE_OFFICER']), {
            eventType: 'PPE_REPLACEMENT', title: `Замена СИЗ: ${names.get(unitId) ?? ''}`,
            message: `${stageText(stage, formatRu(new Date(date)))}. Позиций: ${items.length} (${[...new Set(items.map((i) => i.ppeItem.name))].slice(0, 3).join(', ')}${items.length > 3 ? '…' : ''}).`,
            link: `/ppe?tab=issues&replacement=${stage === 'overdue' ? 'overdue' : 'due'}&unitIds=${unitId}`, entityType: 'unit', entityId: unitId, dedupeKey: `ppe:${key}`,
          }, pr.channels);
        }
        stats.ppe = n;
      }

      // Сроки задач
      const tr = rules.get('TASK_DUE');
      if (tr) {
        let n = 0;
        const list = await this.prisma.task.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, assigneeUserId: { not: null }, dueDate: { lte: addDays(today, maxBefore(tr)) } } });
        for (const t of list) {
          const stage = notificationStage(t.dueDate!, today, tr);
          if (!stage) continue;
          n += await this.notify([t.assigneeUserId!], {
            eventType: 'TASK_DUE', title: `Задача: ${t.title}`, message: stageText(stage, formatRu(t.dueDate)), link: `/tasks?id=${t.id}`,
            entityType: 'task', entityId: t.id, dedupeKey: `task:${t.id}:${stage}:${t.dueDate!.toISOString().slice(0, 10)}`,
          }, tr.channels);
        }
        stats.tasks = n;
      }

      // Ежедневные сводки по несоответствиям правилам периодичности
      if (await this.settings.get('notifications.digestEnabled')) {
        for (const [eventType, kind, label] of [['BRIEFING_COMPLIANCE_DIGEST', 'briefing', 'инструктажам'], ['CHECK_COMPLIANCE_DIGEST', 'check', 'проверкам знаний']] as const) {
          const rule = rules.get(eventType);
          if (!rule) continue;
          const rows = (await this.compliance.compute(SYSTEM_USER, kind)).filter((r) => ['OVERDUE', 'MISSING', 'FAILED'].includes(r.status));
          let n = 0;
          for (const r of recipients) {
            const isSpec = rule.notifySafetySpecialists && r.roles.includes('SAFETY_SPECIALIST');
            const isHead = rule.notifyUnitHeads && r.roles.includes('UNIT_HEAD') && r.unitIds !== null;
            if (!isSpec && !isHead) continue;
            const mine = rows.filter((x) => r.unitIds === null || r.unitIds.includes(x.unitId));
            if (!mine.length) continue;
            const employees = new Set(mine.map((x) => x.employeeId)).size;
            const failed = mine.filter((x) => x.status === 'FAILED').length;
            n += await this.notify([r.id], {
              eventType, title: `Сводка по ${label}`,
              message: `Сотрудников с нарушением сроков: ${employees}${failed ? `, неудовлетворительных результатов: ${failed}` : ''}.`,
              link: kind === 'briefing' ? '/briefings?tab=compliance' : '/checks?tab=compliance', dedupeKey: `digest:${kind}:${today.toISOString().slice(0, 10)}`,
            }, rule.channels);
          }
          stats[`digest_${kind}`] = n;
        }
      }

      const delivery = await this.deliverPending();
      this.logger.log(`Уведомления сформированы: ${JSON.stringify(stats)}, доставка: ${JSON.stringify(delivery)}`);
      return { ...stats, ...delivery };
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_ID})`;
    }
  }

  private async autoTask(
    sourceKey: string, taskType: 'AUTO_BRIEFING' | 'AUTO_CHECK' | 'AUTO_PPE', title: string, due: Date, entityType: string, entityId: string,
    unitId: string | undefined, recipients: Recipient[], responsibleEmployeeId: string | null, roles: string[] = ['SAFETY_SPECIALIST'],
  ) {
    const assignee = recipients.find((r) => responsibleEmployeeId && r.employeeId === responsibleEmployeeId)
      ?? recipients.find((r) => roles.some((x) => r.roles.includes(x)) && (r.unitIds === null || (unitId && r.unitIds.includes(unitId))));
    await this.prisma.task.createMany({
      data: [{ sourceKey, taskType, title, dueDate: due, entityType, entityId, unitId, assigneeUserId: assignee?.id, priority: 'HIGH' }],
      skipDuplicates: true,
    });
  }

  // ───── API пользователя
  async list(userId: string, unreadOnly: boolean, page: number, pageSize: number) {
    const where: Prisma.NotificationWhereInput = { userId, readAt: unreadOnly ? null : undefined };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
