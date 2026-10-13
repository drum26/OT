/**
 * ТЕСТОВЫЕ ДАННЫЕ ДЛЯ ЛОКАЛЬНОЙ РАЗРАБОТКИ. Не использовать в рабочей базе.
 * Все сотрудники вымышлены; правила периодичности и нормы СИЗ имеют основание
 * «ТЕСТОВЫЕ ДАННЫЕ — не является нормативом» и не отражают требования законодательства.
 *   npm run seed:dev            — заполнить пустую базу
 *   npm run seed:dev -- --reset — очистить данные (кроме ролей/разрешений) и заполнить заново
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { hashPassword } from '../src/auth/auth.service';
import { addDays, addMonths, todayInTz } from '../src/common/dates';
import { seedBase } from './seed-base';

const TEST_BASIS = 'ТЕСТОВЫЕ ДАННЫЕ — не является нормативом';
const prisma = new PrismaClient();

let seed = 20240501;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const LAST_M = ['Иванов', 'Петров', 'Сидоров', 'Козлов', 'Новиков', 'Морозов', 'Волков', 'Соколов', 'Лебедев', 'Ковалёв', 'Зайцев', 'Павлов', 'Семёнов', 'Голубев', 'Виноградов', 'Богданов', 'Воробьёв', 'Фёдоров', 'Михайлов', 'Беляев', 'Тарасов', 'Белов', 'Комаров', 'Орлов', 'Киселёв', 'Макаров', 'Андреев', 'Ковальчук', 'Шевчук', 'Мельник'];
const FIRST_M = ['Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей', 'Алексей', 'Артём', 'Илья', 'Кирилл', 'Михаил', 'Никита', 'Павел', 'Роман', 'Евгений', 'Владимир', 'Олег', 'Игорь', 'Виктор'];
const FIRST_F = ['Анна', 'Мария', 'Елена', 'Ольга', 'Наталья', 'Татьяна', 'Ирина', 'Светлана', 'Юлия', 'Екатерина', 'Дарья', 'Алина', 'Виктория'];
const MID_M = ['Александрович', 'Сергеевич', 'Иванович', 'Петрович', 'Николаевич', 'Владимирович', 'Андреевич', 'Михайлович', 'Викторович'];
const MID_F = ['Александровна', 'Сергеевна', 'Ивановна', 'Петровна', 'Николаевна', 'Владимировна', 'Андреевна', 'Михайловна', 'Викторовна'];
const fem = (s: string) => (s.endsWith('ук') ? s : s.replace(/ёв$/, 'ёва').replace(/ов$/, 'ова').replace(/ев$/, 'ева').replace(/ин$/, 'ина'));

async function reset() {
  const t = ['notification_deliveries', 'notifications', 'tasks', 'ppe_stock_movements', 'ppe_returns', 'ppe_issues', 'ppe_standards', 'ppe_items',
    'knowledge_check_results', 'knowledge_check_participants', 'knowledge_checks', 'commission_members', 'commissions', 'knowledge_check_rules', 'knowledge_check_types',
    'briefing_participants', 'briefings', 'briefing_rules', 'briefing_types', 'safety_documents', 'attachments', 'import_errors', 'import_jobs',
    'employee_history', 'refresh_tokens', 'user_unit_scopes', 'user_roles', 'users', 'employees', 'positions', 'organizational_units', 'audit_logs'];
  await prisma.$executeRawUnsafe(`TRUNCATE ${t.join(', ')} CASCADE`);
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) throw new Error('Тестовые данные не загружаются в production');
  if (process.argv.includes('--reset')) await reset();
  if (await prisma.employee.count()) throw new Error('В базе уже есть сотрудники. Используйте --reset для пересоздания тестовых данных.');
  await seedBase(prisma);
  const today = todayInTz();

  // Оргструктура
  const root = await prisma.organizationalUnit.create({ data: { code: 'ORG', name: 'Тестовое предприятие' } });
  const unitNames = ['Администрация', 'Отдел охраны труда', 'Отдел кадров', 'Механический цех', 'Сборочный цех', 'Литейный цех', 'Ремонтно-механический цех', 'Склад', 'Транспортный участок', 'Энергослужба', 'Лаборатория', 'Участок окраски'];
  const units: { id: string; code: string | null }[] = [];
  for (const [i, name] of unitNames.entries()) units.push(await prisma.organizationalUnit.create({ data: { code: `U${String(i + 1).padStart(2, '0')}`, name, parentId: root.id } }));
  const sub = await prisma.organizationalUnit.create({ data: { code: 'U04-1', name: 'Механический цех — участок токарной обработки', parentId: units[3].id } });
  units.push(sub);

  const posDefs: [string, string | null, boolean][] = [
    ['Директор', null, false], ['Инженер по охране труда', null, false], ['Специалист по кадрам', null, false], ['Мастер участка', 'Тестовая категория А', false],
    ['Начальник цеха', null, false], ['Токарь', 'Тестовая категория А', true], ['Фрезеровщик', 'Тестовая категория А', true], ['Слесарь-ремонтник', 'Тестовая категория А', true],
    ['Слесарь механосборочных работ', 'Тестовая категория А', true], ['Литейщик', 'Тестовая категория Б', true], ['Электромонтёр', 'Тестовая категория Б', true],
    ['Водитель погрузчика', 'Тестовая категория Б', true], ['Кладовщик', null, true], ['Маляр', 'Тестовая категория Б', true], ['Лаборант', null, true],
    ['Бухгалтер', null, false], ['Инженер-технолог', null, false], ['Уборщик помещений', null, true], ['Водитель автомобиля', 'Тестовая категория Б', true], ['Электрогазосварщик', 'Тестовая категория Б', true],
  ];
  const positions: { id: string; name: string; workCategory: string | null }[] = [];
  for (const [name, workCategory, isProfession] of posDefs) positions.push(await prisma.position.create({ data: { name, workCategory, isProfession } }));
  const P = (n: string) => positions.find((p) => p.name === n)!;
  const shopPositions = ['Токарь', 'Фрезеровщик', 'Слесарь-ремонтник', 'Слесарь механосборочных работ', 'Литейщик', 'Электромонтёр', 'Маляр', 'Электрогазосварщик'].map(P);
  const officePositions = ['Бухгалтер', 'Инженер-технолог', 'Специалист по кадрам', 'Инженер по охране труда'].map(P);

  // 2000 сотрудников
  const employees: any[] = [];
  const history: any[] = [];
  for (let i = 1; i <= 2000; i++) {
    const female = rnd() < 0.3;
    const unit = i <= 40 ? pick(units.slice(0, 3)) : pick(units.slice(3));
    const position = unit.code && ['U01', 'U02', 'U03'].includes(unit.code) ? pick(officePositions) : rnd() < 0.85 ? pick(shopPositions) : pick([P('Мастер участка'), P('Кладовщик'), P('Водитель погрузчика'), P('Уборщик помещений'), P('Лаборант')]);
    const hireDate = addDays(today, -int(20, 365 * 12));
    const dismissed = rnd() < 0.03;
    const e = {
      id: randomUUID(), personnelNumber: String(10000 + i), lastName: female ? fem(pick(LAST_M)) : pick(LAST_M), firstName: female ? pick(FIRST_F) : pick(FIRST_M),
      middleName: female ? pick(MID_F) : pick(MID_M), unitId: unit.id, positionId: position.id, hireDate,
      status: dismissed ? 'DISMISSED' as const : rnd() < 0.02 ? 'ABSENT' as const : 'ACTIVE' as const, dismissalDate: dismissed ? addDays(today, -int(1, 15)) : null,
    };
    employees.push(e);
    history.push({ employeeId: e.id, changeType: 'HIRE' as const, effectiveDate: hireDate, toUnitId: e.unitId, toPositionId: e.positionId, reason: 'Тестовые данные' });
    if (dismissed) history.push({ employeeId: e.id, changeType: 'DISMISSAL' as const, effectiveDate: e.dismissalDate!, fromUnitId: e.unitId, fromPositionId: e.positionId, reason: 'Тестовые данные' });
  }
  await prisma.employee.createMany({ data: employees });
  await prisma.employeeHistory.createMany({ data: history });
  const active = employees.filter((e) => e.status !== 'DISMISSED');
  const specialist = employees.find((e) => e.positionId === P('Инженер по охране труда').id) ?? employees[0];

  // Пользователи для каждой роли (пароль для разработки)
  const devPassword = process.env.DEV_PASSWORD || 'DevPassword2024';
  const hash = await hashPassword(devPassword);
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const mkUser = (login: string, fullName: string, role: string, allUnits: boolean, unitIds: string[] = [], employeeId?: string) =>
    prisma.user.create({ data: { login, fullName, passwordHash: hash, allUnits, employeeId, roles: { create: [{ roleId: roles.get(role)! }] }, unitScopes: { create: unitIds.map((unitId) => ({ unitId })) } } });
  await mkUser('admin', 'Администратор (тест)', 'ADMIN', true);
  await mkUser('specialist', 'Специалист по ОТ (тест)', 'SAFETY_SPECIALIST', true, [], specialist.id);
  await mkUser('head', 'Начальник механического цеха (тест)', 'UNIT_HEAD', false, [units[3].id]);
  await mkUser('hr', 'Кадровый специалист (тест)', 'HR', true);
  await mkUser('ppe', 'Ответственный за СИЗ (тест)', 'PPE_OFFICER', true);
  await mkUser('auditor', 'Аудитор (тест)', 'AUDITOR', true);

  // Справочники ОТ (тестовые)
  const doc = await prisma.safetyDocument.create({ data: { docType: 'INSTRUCTION', number: 'ТЕСТ-1', title: 'Инструкция по охране труда (тестовый документ)', version: '1', isActive: true } });
  const bt = {
    intro: await prisma.briefingType.create({ data: { code: 'INTRO', name: 'Вводный', isPeriodic: false, sortOrder: 1, description: TEST_BASIS } }),
    primary: await prisma.briefingType.create({ data: { code: 'PRIMARY', name: 'Первичный на рабочем месте', isPeriodic: false, sortOrder: 2, description: TEST_BASIS } }),
    repeat: await prisma.briefingType.create({ data: { code: 'REPEAT', name: 'Повторный', isPeriodic: true, sortOrder: 3, description: TEST_BASIS } }),
    unplanned: await prisma.briefingType.create({ data: { code: 'UNPLANNED', name: 'Внеплановый', isPeriodic: false, sortOrder: 4, description: TEST_BASIS } }),
    target: await prisma.briefingType.create({ data: { code: 'TARGET', name: 'Целевой', isPeriodic: false, sortOrder: 5, requiresConfirmation: false, description: TEST_BASIS } }),
  };
  const vf = new Date(Date.UTC(2000, 0, 1));
  await prisma.briefingRule.createMany({ data: [
    { briefingTypeId: bt.intro.id, initialDueDays: 0, basis: TEST_BASIS, validFrom: vf },
    { briefingTypeId: bt.primary.id, initialDueDays: 0, resetOnTransfer: true, basis: TEST_BASIS, validFrom: vf },
    { briefingTypeId: bt.repeat.id, periodMonths: 12, initialDueDays: 30, basis: TEST_BASIS, validFrom: vf, note: 'Общее тестовое правило' },
    { briefingTypeId: bt.repeat.id, workCategory: 'Тестовая категория Б', periodMonths: 6, initialDueDays: 30, basis: TEST_BASIS, validFrom: vf, note: 'Тестовое правило для категории Б' },
  ] });
  const ct = {
    periodic: await prisma.knowledgeCheckType.create({ data: { code: 'PERIODIC', name: 'Периодическая', description: TEST_BASIS } }),
    unscheduled: await prisma.knowledgeCheckType.create({ data: { code: 'UNSCHEDULED', name: 'Внеочередная', description: TEST_BASIS } }),
  };
  await prisma.knowledgeCheckRule.createMany({ data: [
    { checkTypeId: ct.periodic.id, workCategory: 'Тестовая категория А', periodMonths: 12, retestDays: 30, initialDueDays: 30, basis: TEST_BASIS, validFrom: vf },
    { checkTypeId: ct.periodic.id, workCategory: 'Тестовая категория Б', periodMonths: 12, retestDays: 30, initialDueDays: 30, basis: TEST_BASIS, validFrom: vf },
  ] });
  const officeEmps = employees.filter((e) => officePositions.some((p) => p.id === e.positionId)).slice(0, 3);
  const commission = await prisma.commission.create({
    data: { name: 'Тестовая комиссия по проверке знаний', orderNumber: 'ТЕСТ-10', orderDate: addDays(today, -400),
      members: { create: officeEmps.map((e, i) => ({ employeeId: e.id, role: i === 0 ? 'CHAIR' as const : 'MEMBER' as const })) } },
  });

  // История инструктажей: вводный и первичный при приёме, повторный — у большинства
  const workers = active.filter((e) => e.unitId !== units[0].id);
  const byDate = new Map<string, any[]>();
  const add = (typeId: string, date: Date, e: any) => {
    const k = `${typeId}|${date.toISOString().slice(0, 10)}|${e.unitId}`;
    byDate.set(k, [...(byDate.get(k) ?? []), e]);
  };
  for (const e of workers) {
    if (rnd() < 0.97) add(bt.intro.id, e.hireDate, e);
    if (rnd() < 0.95) add(bt.primary.id, e.hireDate, e);
    const cat = positions.find((p) => p.id === e.positionId)!.workCategory;
    const period = cat === 'Тестовая категория Б' ? 6 : 12;
    if (rnd() < 0.85) {
      let d = addMonths(e.hireDate, period);
      const lastShift = int(-60, 40);
      while (addMonths(d, period) <= addDays(today, lastShift)) d = addMonths(d, period);
      if (d <= today && d >= e.hireDate) add(bt.repeat.id, d, e);
    }
  }
  const resp = specialist.id;
  for (const [k, list] of byDate) {
    const [typeId, ds] = k.split('|');
    const date = new Date(ds);
    const rule = typeId === bt.repeat.id ? 'rep' : null;
    await prisma.briefing.create({
      data: {
        briefingTypeId: typeId, status: 'CONDUCTED', conductedDate: date, responsibleEmployeeId: resp, documentId: doc.id, topic: 'Тестовая запись',
        participants: { create: list.map((e) => {
          const cat = positions.find((p) => p.id === e.positionId)!.workCategory;
          return {
            employeeId: e.id, unitId: e.unitId, positionId: e.positionId, result: 'COMPLETED' as const,
            confirmed: rnd() < 0.92, confirmationMethod: 'PAPER_JOURNAL_SIGNATURE' as const, confirmedAt: date,
            nextDueDate: rule ? addMonths(date, cat === 'Тестовая категория Б' ? 6 : 12) : null,
          };
        }) },
      },
    });
  }
  // Запланированные инструктажи (в т.ч. один просроченный)
  const shop = workers.filter((e) => e.unitId === units[3].id);
  await prisma.briefing.create({ data: { briefingTypeId: bt.repeat.id, plannedDate: addDays(today, 5), responsibleEmployeeId: resp, documentId: doc.id, topic: 'Плановый повторный инструктаж',
    participants: { create: shop.slice(0, 15).map((e) => ({ employeeId: e.id, unitId: e.unitId, positionId: e.positionId })) } } });
  await prisma.briefing.create({ data: { briefingTypeId: bt.unplanned.id, plannedDate: addDays(today, -3), responsibleEmployeeId: resp, reason: 'Тестовое основание',
    participants: { create: shop.slice(15, 22).map((e) => ({ employeeId: e.id, unitId: e.unitId, positionId: e.positionId })) } } });

  // Проверки знаний
  const catWorkers = workers.filter((e) => positions.find((p) => p.id === e.positionId)!.workCategory);
  const chunks: any[][] = [];
  for (let i = 0; i < catWorkers.length * 0.8; i += 40) chunks.push(catWorkers.slice(i, i + 40));
  let protocol = 1;
  for (const ch of chunks) {
    const date = addDays(today, -int(10, 420));
    const parts = ch.filter((e) => e.hireDate <= date);
    if (!parts.length) continue;
    const c = await prisma.knowledgeCheck.create({ data: { checkTypeId: ct.periodic.id, status: 'CONDUCTED', conductedDate: date, commissionId: commission.id, protocolNumber: `Т-${protocol++}`, protocolDate: date, reason: 'Тестовые данные' } });
    for (const e of parts) {
      const p = await prisma.knowledgeCheckParticipant.create({ data: { checkId: c.id, employeeId: e.id, unitId: e.unitId, positionId: e.positionId } });
      const failed = rnd() < 0.04;
      await prisma.knowledgeCheckResult.create({ data: { participantId: p.id, outcome: failed ? 'FAILED' : 'PASSED', nextCheckDate: failed ? addDays(date, 30) : addMonths(date, 12), comment: failed ? 'Тестовый неудовлетворительный результат' : null } });
    }
  }
  await prisma.knowledgeCheck.create({ data: { checkTypeId: ct.periodic.id, plannedDate: addDays(today, 10), commissionId: commission.id, reason: 'Плановая проверка (тест)',
    participants: { create: catWorkers.slice(-20).map((e) => ({ employeeId: e.id, unitId: e.unitId, positionId: e.positionId })) } } });

  // СИЗ (тестовый справочник и нормы)
  const items = [
    ['К-1', 'Костюм для защиты от общих производственных загрязнений', 'Спецодежда', 'CLOTHING', 12],
    ['О-1', 'Ботинки кожаные', 'Спецобувь', 'SHOES', 12],
    ['П-1', 'Перчатки трикотажные с ПВХ', 'Средства защиты рук', 'HANDS', 1],
    ['Ч-1', 'Очки защитные открытые', 'Средства защиты глаз', 'NONE', null],
    ['Р-1', 'Респиратор фильтрующий', 'СИЗ органов дыхания', 'NONE', null],
    ['Ш-1', 'Каска защитная', 'Средства защиты головы', 'NONE', 24],
    ['С-1', 'Костюм сварщика', 'Спецодежда', 'CLOTHING', 12],
  ] as const;
  const ppe: Record<string, any> = {};
  for (const [code, name, category, sizeType, wear] of items) {
    ppe[code] = await prisma.ppeItem.create({ data: { code, name, category, sizeType: sizeType as any, defaultWearMonths: wear, basis: TEST_BASIS, unit: code === 'П-1' || code === 'О-1' ? 'пара' : 'шт.' } });
  }
  const stdData: any[] = [];
  for (const pos of shopPositions) {
    stdData.push({ positionId: pos.id, ppeItemId: ppe['К-1'].id, quantity: 1, wearMonths: 12, basis: TEST_BASIS, validFrom: vf });
    stdData.push({ positionId: pos.id, ppeItemId: ppe['О-1'].id, quantity: 1, wearMonths: 12, basis: TEST_BASIS, validFrom: vf, unit: 'пара' });
    stdData.push({ positionId: pos.id, ppeItemId: ppe['П-1'].id, quantity: 12, wearMonths: 12, basis: TEST_BASIS, validFrom: vf, unit: 'пара', note: 'Тест: 12 пар на год' });
    stdData.push({ positionId: pos.id, ppeItemId: ppe['Ч-1'].id, quantity: 1, wearMonths: null, wearCondition: 'до износа', basis: TEST_BASIS, validFrom: vf });
  }
  stdData.push({ positionId: P('Электрогазосварщик').id, ppeItemId: ppe['С-1'].id, quantity: 1, wearMonths: 12, basis: TEST_BASIS, validFrom: vf });
  stdData.push({ positionId: P('Литейщик').id, ppeItemId: ppe['Р-1'].id, quantity: 1, wearMonths: null, wearCondition: 'до износа', basis: TEST_BASIS, validFrom: vf });
  await prisma.ppeStandard.createMany({ data: stdData });
  for (const it of Object.values(ppe)) await prisma.ppeStockMovement.create({ data: { ppeItemId: it.id, size: null, quantity: int(20, 150), movementType: 'RECEIPT', movementDate: addDays(today, -60), document: 'ТЕСТ-накладная' } });
  const issues: any[] = [];
  for (const e of workers.filter((x) => shopPositions.some((p) => p.id === x.positionId))) {
    for (const code of ['К-1', 'О-1', 'Ч-1']) {
      if (rnd() < 0.15) continue;
      const d = addDays(today, -int(5, 420));
      if (d < e.hireDate) continue;
      const wear = code === 'Ч-1' ? null : 12;
      issues.push({ employeeId: e.id, ppeItemId: ppe[code].id, unitId: e.unitId, positionId: e.positionId, quantity: 1, issueDate: d, size: code === 'К-1' ? pick(['48-50/170', '52-54/176', '56-58/182']) : code === 'О-1' ? String(int(39, 46)) : null,
        wearMonths: wear, plannedReplacementDate: wear ? addMonths(d, wear) : null, issuerName: 'Ответственный за СИЗ (тест)', receiptConfirmed: rnd() < 0.9, receiptMethod: 'PAPER_JOURNAL_SIGNATURE' as const, basis: TEST_BASIS });
    }
  }
  for (let i = 0; i < issues.length; i += 1000) await prisma.ppeIssue.createMany({ data: issues.slice(i, i + 1000) });

  await prisma.task.create({ data: { title: 'Проверка состояния рабочих мест механического цеха (тест)', taskType: 'CONTROL_EVENT', dueDate: addDays(today, 7), unitId: units[3].id, priority: 'NORMAL' } });
  await prisma.systemSetting.upsert({ where: { key: 'organization.name' }, create: { key: 'organization.name', value: 'Тестовое предприятие' }, update: {} });

  console.log(`Тестовые данные созданы: сотрудников ${employees.length}, инструктажей ${byDate.size + 2}, выдач СИЗ ${issues.length}.`);
  console.log(`Пользователи: admin, specialist, head, hr, ppe, auditor; пароль: ${process.env.DEV_PASSWORD ? '(из DEV_PASSWORD)' : devPassword}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); }).finally(() => prisma.$disconnect());
