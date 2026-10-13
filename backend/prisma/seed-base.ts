/**
 * Базовые (не тестовые) данные, необходимые для работы системы. Идемпотентно.
 *  - каталог разрешений и стартовые роли (существующие роли не перезаписываются);
 *  - правила уведомлений по умолчанию (параметры напоминаний, не нормативы);
 *  - шаблоны печатных форм — ПРИМЕРЫ, помеченные как непроверенные.
 * Нормативные сроки, виды инструктажей, нормы СИЗ НЕ создаются: их вносит организация по применимым документам.
 */
import { PrismaClient, NotificationEventType } from '@prisma/client';
import { PERMISSION_CATALOG, ROLE_DEFAULTS } from '../src/common/permissions';
import { DEFAULT_TEMPLATES } from '../src/templates/default-templates';

const RULES: { eventType: NotificationEventType; name: string; daysBefore: number[]; createTaskOnOverdue: boolean }[] = [
  { eventType: 'BRIEFING_PLANNED', name: 'Запланированные инструктажи', daysBefore: [7, 1], createTaskOnOverdue: true },
  { eventType: 'KNOWLEDGE_CHECK_PLANNED', name: 'Запланированные проверки знаний', daysBefore: [14, 3], createTaskOnOverdue: true },
  { eventType: 'PPE_REPLACEMENT', name: 'Плановая замена СИЗ', daysBefore: [14], createTaskOnOverdue: false },
  { eventType: 'TASK_DUE', name: 'Сроки задач', daysBefore: [3], createTaskOnOverdue: false },
  { eventType: 'BRIEFING_COMPLIANCE_DIGEST', name: 'Ежедневная сводка: инструктажи', daysBefore: [], createTaskOnOverdue: false },
  { eventType: 'CHECK_COMPLIANCE_DIGEST', name: 'Ежедневная сводка: проверки знаний', daysBefore: [], createTaskOnOverdue: false },
];

export async function seedBase(prisma: PrismaClient) {
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({ where: { code: p.code }, create: { code: p.code, name: p.name, groupName: p.group }, update: { name: p.name, groupName: p.group } });
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  for (const r of ROLE_DEFAULTS) {
    const ex = await prisma.role.findUnique({ where: { code: r.code } });
    if (ex) {
      // Администратору всегда добавляются новые разрешения
      if (r.code === 'ADMIN') {
        await prisma.rolePermission.createMany({ data: r.permissions.map((c) => ({ roleId: ex.id, permissionId: perms.get(c)! })), skipDuplicates: true });
      }
      continue;
    }
    await prisma.role.create({
      data: { code: r.code, name: r.name, description: r.description, isSystem: true, permissions: { create: r.permissions.map((c) => ({ permissionId: perms.get(c)! })) } },
    });
  }
  for (const r of RULES) {
    await prisma.notificationRule.upsert({ where: { eventType: r.eventType }, create: { ...r }, update: {} });
  }
  for (const t of DEFAULT_TEMPLATES) {
    const ex = await prisma.documentTemplate.findFirst({ where: { code: t.code } });
    if (!ex) await prisma.documentTemplate.create({ data: { ...t, version: 1, isActive: true, isVerified: false, basis: 'Шаблон-пример, поставляемый с системой' } });
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedBase(prisma)
    .then(() => console.log('Базовые данные созданы/обновлены'))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
