import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';

process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
process.env.SCHEDULER_ENABLED = 'false';
process.env.JWT_ACCESS_SECRET = 'e2e-access-secret-0123456789-0123456789';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-0123456789-0123456789';
process.env.LOGIN_MAX_ATTEMPTS = '3';
process.env.LOGIN_RATE_LIMIT = '12';
process.env.UPLOAD_DIR = '/tmp/ot-e2e-uploads';
process.env.BACKUP_DIR = '/tmp/ot-e2e-backups';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { seedBase } from '../prisma/seed-base';
import { hashPassword } from '../src/auth/auth.service';
import { addDays, formatDateOnly, todayInTz } from '../src/common/dates';

const PASS = 'E2ePassword123';
const iso = (d: Date) => formatDateOnly(d)!;

describe('Охрана труда — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: ReturnType<typeof request>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const today = todayInTz();

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const login = async (l: string) => {
    const r = await request(app.getHttpServer()).post('/api/auth/login').send({ login: l, password: PASS });
    expect(r.status).toBe(200);
    tokens[l] = r.body.accessToken;
    return r;
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await seedBase(prisma);
    const u1 = await prisma.organizationalUnit.create({ data: { name: 'Цех 1', code: 'C1' } });
    const u2 = await prisma.organizationalUnit.create({ data: { name: 'Цех 2', code: 'C2' } });
    const p1 = await prisma.position.create({ data: { name: 'Токарь', workCategory: 'A' } });
    const p2 = await prisma.position.create({ data: { name: 'Слесарь' } });
    Object.assign(ids, { u1: u1.id, u2: u2.id, p1: p1.id, p2: p2.id });
    const roles = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
    const hash = await hashPassword(PASS);
    const mk = (login: string, role: string, allUnits: boolean, units: string[] = []) => prisma.user.create({
      data: { login, fullName: login, passwordHash: hash, allUnits, roles: { create: [{ roleId: roles.get(role)! }] }, unitScopes: { create: units.map((unitId) => ({ unitId })) } },
    });
    await mk('admin', 'ADMIN', true);
    await mk('spec', 'SAFETY_SPECIALIST', true);
    await mk('head', 'UNIT_HEAD', false, [u1.id]);
    await mk('hr', 'HR', true);
    await mk('ppe', 'PPE_OFFICER', true);
    await mk('auditor', 'AUDITOR', true);
    await mk('locked', 'AUDITOR', true);

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());
    for (const l of ['admin', 'spec', 'head', 'hr', 'ppe', 'auditor']) await login(l);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('Авторизация', () => {
    it('неверный пароль → 401, блокировка после серии попыток', async () => {
      for (let i = 0; i < 3; i++) expect((await http.post('/api/auth/login').send({ login: 'locked', password: 'wrong-password-1' })).status).toBe(401);
      const r = await http.post('/api/auth/login').send({ login: 'locked', password: PASS });
      expect(r.status).toBe(401);
      expect(r.body.message).toMatch(/заблокирована/);
    });

    it('без токена → 401', async () => {
      expect((await http.get('/api/employees')).status).toBe(401);
    });

    it('refresh: требуется CSRF-заголовок, токен ротируется, повторное использование отзывает сессию', async () => {
      const l = await http.post('/api/auth/login').send({ login: 'auditor', password: PASS });
      const cookie = (l.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('ot_refresh='))!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect((await http.post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
      const r1 = await http.post('/api/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest');
      expect(r1.status).toBe(200);
      const cookie2 = (r1.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('ot_refresh='))!;
      // повторное использование старого токена
      expect((await http.post('/api/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest')).status).toBe(401);
      // вся цепочка отозвана
      expect((await http.post('/api/auth/refresh').set('Cookie', cookie2).set('X-Requested-With', 'XMLHttpRequest')).status).toBe(401);
    });

    it('ограничение частоты попыток входа (429)', async () => {
      let last = 0;
      for (let i = 0; i < 3; i++) last = (await http.post('/api/auth/login').send({ login: 'nobody', password: 'x' })).status;
      expect(last).toBe(429);
    });
  });

  describe('Сотрудники и импорт', () => {
    it('шаблон импорта и предварительный просмотр с ошибками', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('S');
      ws.addRow(['Табельный номер*', 'Фамилия*', 'Имя*', 'Отчество', 'Подразделение*', 'Должность*', 'Дата приёма*', 'Статус', 'Дата увольнения', 'Табельный номер руководителя']);
      ws.addRow(['1001', 'Иванов', 'Иван', 'Иванович', 'Цех 1', 'Токарь', '10.01.2020', '', '', '']);
      ws.addRow(['1002', 'Петров', 'Пётр', '', 'C1', 'Токарь', new Date(Date.UTC(2021, 4, 5)), 'работает', '', '1001']);
      ws.addRow(['1003', 'Сидорова', 'Анна', '', 'Цех 2', 'Слесарь', '01.03.2022', '', '', '']);
      ws.addRow(['1003', 'Дубль', 'Строка', '', 'Цех 2', 'Слесарь', '01.03.2022', '', '', '']);
      ws.addRow(['1004', '', 'Без фамилии', '', 'Цех 9', 'Токарь', '99.99.2022', '', '', '']);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      expect((await http.post('/api/employees/import/preview').set(auth('auditor')).attach('file', buf, 'emp.xlsx')).status).toBe(403);
      const r = await http.post('/api/employees/import/preview').set(auth('hr')).attach('file', buf, 'emp.xlsx');
      expect(r.status).toBe(201);
      expect(r.body.toCreate).toBe(3);
      expect(r.body.errorRows).toBe(2);
      ids.job = r.body.jobId;
    });

    it('подтверждение импорта создаёт записи и историю, повторный импорт не создаёт дубликатов', async () => {
      const c = await http.post(`/api/employees/import/${ids.job}/commit`).set(auth('hr'));
      expect(c.status).toBe(201);
      expect(c.body).toMatchObject({ status: 'COMPLETED', createdCount: 3 });
      expect(await prisma.employee.count()).toBe(3);
      const petrov = await prisma.employee.findUniqueOrThrow({ where: { personnelNumber: '1002' }, include: { manager: true } });
      expect(petrov.manager?.personnelNumber).toBe('1001');

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('S');
      ws.addRow(['Табельный номер', 'Фамилия', 'Имя', 'Подразделение', 'Должность', 'Дата приема']);
      ws.addRow(['1001', 'Иванов', 'Иван', 'Цех 2', 'Слесарь', '10.01.2020']);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      const p = await http.post('/api/employees/import/preview').set(auth('hr')).field('updateExisting', 'true').attach('file', buf, 'emp2.xlsx');
      expect(p.body.toUpdate).toBe(1);
      await http.post(`/api/employees/import/${p.body.jobId}/commit`).set(auth('hr')).expect(201);
      expect(await prisma.employee.count()).toBe(3);
      const iv = await prisma.employee.findUniqueOrThrow({ where: { personnelNumber: '1001' } });
      expect(iv.unitId).toBe(ids.u2);
      // вернуть в цех 1 переводом через API (история сохраняется)
      ids.ivanov = iv.id;
      const t = await http.post(`/api/employees/${iv.id}/transfer`).set(auth('hr')).send({ unitId: ids.u1, positionId: ids.p1, effectiveDate: iso(addDays(today, -400)), reason: 'тест' });
      expect(t.status).toBe(201);
      const h = await http.get(`/api/employees/${iv.id}/history`).set(auth('hr'));
      expect(h.body.map((x: any) => x.changeType)).toEqual(expect.arrayContaining(['IMPORT_CREATE', 'TRANSFER']));
      ids.petrov = petrov.id;
      ids.sidorova = (await prisma.employee.findUniqueOrThrow({ where: { personnelNumber: '1003' } })).id;
      await prisma.employee.updateMany({ data: { hireDate: addDays(today, -800) } });
    });

    it('ограничение по подразделениям: руководитель видит только своё подразделение', async () => {
      const l = await http.get('/api/employees').set(auth('head'));
      expect(l.status).toBe(200);
      expect(l.body.items.every((e: any) => e.unitId === ids.u1)).toBe(true);
      expect((await http.get(`/api/employees/${ids.sidorova}`).set(auth('head'))).status).toBe(403);
      expect((await http.post('/api/employees').set(auth('head')).send({ personnelNumber: 'X1', lastName: 'А', firstName: 'Б', unitId: ids.u1, positionId: ids.p1, hireDate: '2020-01-01' })).status).toBe(403);
    });

    it('валидация входных данных и экспорт', async () => {
      const r = await http.post('/api/employees').set(auth('hr')).send({ personnelNumber: '1001', lastName: '<script>', firstName: 'Б', unitId: ids.u1, positionId: ids.p1, hireDate: '2020-13-01', extra: 1 });
      expect(r.status).toBe(400);
      const ex = await http.get('/api/employees/export?format=xlsx').set(auth('admin'));
      expect(ex.status).toBe(200);
      expect(ex.headers['content-type']).toMatch(/spreadsheetml/);
    });
  });

  describe('Инструктажи', () => {
    beforeAll(async () => {
      const t = await http.post('/api/briefing-types').set(auth('spec')).send({ code: 'REP', name: 'Повторный', isPeriodic: true, requiresConfirmation: true });
      ids.bt = t.body.id;
      await http.post('/api/briefing-rules').set(auth('spec')).send({ typeId: ids.bt, periodMonths: 12, basis: 'Тестовое правило', validFrom: '2000-01-01' }).expect(201);
      await http.post('/api/briefing-rules').set(auth('spec')).send({ typeId: ids.bt, workCategory: 'A', periodMonths: 6, basis: 'Тестовое правило категории A', validFrom: '2000-01-01' }).expect(201);
    });

    it('без прохождения сотрудники попадают в список «требуется инструктаж»', async () => {
      const c = await http.get('/api/briefings/compliance').set(auth('spec'));
      expect(c.body.filter((r: any) => r.status === 'MISSING')).toHaveLength(3);
    });

    it('планирование группы, запрет проведения без обязательных полей, регистрация, подтверждение', async () => {
      const p = await http.post('/api/briefings/plan').set(auth('spec')).send({ briefingTypeId: ids.bt, plannedDate: iso(addDays(today, 3)), employeeIds: [ids.ivanov, ids.petrov, ids.sidorova] });
      expect(p.status).toBe(201);
      ids.briefing = p.body.id;
      const bad = await http.post(`/api/briefings/${ids.briefing}/conduct`).set(auth('spec')).send({ conductedDate: iso(today), participants: [{ employeeId: ids.ivanov, result: 'COMPLETED' }] });
      expect(bad.status).toBe(400);
      const partial = await http.post(`/api/briefings/${ids.briefing}/conduct`).set(auth('spec')).send({ conductedDate: iso(today), responsibleEmployeeId: ids.petrov, participants: [{ employeeId: ids.ivanov, result: 'COMPLETED' }] });
      expect(partial.status).toBe(400);
      expect(partial.body.message).toMatch(/всех участников/);
      const ok = await http.post(`/api/briefings/${ids.briefing}/conduct`).set(auth('spec')).send({
        conductedDate: iso(today), responsibleEmployeeId: ids.petrov, topic: 'Тема',
        participants: [{ employeeId: ids.ivanov, result: 'COMPLETED' }, { employeeId: ids.petrov, result: 'COMPLETED', confirmed: true, confirmationMethod: 'PAPER_JOURNAL_SIGNATURE' }, { employeeId: ids.sidorova, result: 'ABSENT' }],
      });
      expect(ok.status).toBe(201);
      const b = await http.get(`/api/briefings/${ids.briefing}`).set(auth('spec'));
      const iv = b.body.participants.find((x: any) => x.employeeId === ids.ivanov);
      // Иванов — Токарь (категория A) → правило 6 мес.
      expect(iv.nextDueDate.slice(0, 10)).toBe(iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 6, today.getUTCDate()))));
      expect(iv.confirmed).toBe(false);
      // Без подтверждения проведение не засчитывается
      let c = await http.get(`/api/briefings/compliance?employeeId=${ids.ivanov}`).set(auth('spec'));
      expect(c.body[0].status).toBe('MISSING');
      await http.post(`/api/briefings/${ids.briefing}/confirm`).set(auth('spec')).send({ participantIds: [iv.id], method: 'PAPER_JOURNAL_SIGNATURE' }).expect(201);
      c = await http.get(`/api/briefings/compliance?employeeId=${ids.ivanov}`).set(auth('spec'));
      expect(c.body[0].status).toBe('OK');
    });

    it('аудитор и руководитель не могут регистрировать мероприятия', async () => {
      expect((await http.post('/api/briefings/plan').set(auth('auditor')).send({ briefingTypeId: ids.bt, plannedDate: iso(today), employeeIds: [ids.ivanov] })).status).toBe(403);
      expect((await http.post('/api/briefings/plan').set(auth('head')).send({ briefingTypeId: ids.bt, plannedDate: iso(today), employeeIds: [ids.ivanov] })).status).toBe(403);
    });
  });

  describe('Проверки знаний', () => {
    it('отрицательный результат выделяется, сотрудник не считается прошедшим', async () => {
      const t = await http.post('/api/check-types').set(auth('spec')).send({ code: 'PER', name: 'Периодическая' });
      ids.ct = t.body.id;
      await http.post('/api/check-rules').set(auth('spec')).send({ typeId: ids.ct, periodMonths: 12, retestDays: 30, basis: 'Тест', validFrom: '2000-01-01' }).expect(201);
      const noProto = await http.post('/api/knowledge-checks/register').set(auth('spec')).send({ checkTypeId: ids.ct, conductedDate: iso(today), responsibleEmployeeId: ids.petrov, results: [{ employeeId: ids.ivanov, outcome: 'PASSED' }] });
      expect(noProto.status).toBe(400);
      const r = await http.post('/api/knowledge-checks/register').set(auth('spec')).send({
        checkTypeId: ids.ct, conductedDate: iso(today), responsibleEmployeeId: ids.petrov, protocolNumber: '1', protocolDate: iso(today),
        results: [{ employeeId: ids.ivanov, outcome: 'PASSED' }, { employeeId: ids.petrov, outcome: 'FAILED' }],
      });
      expect(r.status).toBe(201);
      const c = await http.get('/api/knowledge-checks/compliance').set(auth('spec'));
      expect(c.body.find((x: any) => x.employeeId === ids.petrov).status).toBe('FAILED');
      expect(c.body.find((x: any) => x.employeeId === ids.ivanov).status).toBe('OK');
      expect(c.body.find((x: any) => x.employeeId === ids.sidorova).status).toBe('MISSING');
      const d = await http.get('/api/dashboard').set(auth('spec'));
      expect(d.body.checks.failedEmployees).toBe(1);
      const rep = await http.get('/api/reports/failed-checks').set(auth('spec'));
      expect(rep.body.rows).toHaveLength(1);
    });
  });

  describe('СИЗ', () => {
    it('выдача без подтверждения, подтверждение, возврат, остатки', async () => {
      const item = await http.post('/api/ppe/items').set(auth('spec')).send({ name: 'Костюм', category: 'Спецодежда', sizeType: 'CLOTHING' });
      ids.item = item.body.id;
      await http.post('/api/ppe/standards').set(auth('spec')).send({ positionId: ids.p1, ppeItemId: ids.item, quantity: 1, wearMonths: 12, basis: 'Тест', validFrom: '2000-01-01' }).expect(201);
      await http.post('/api/ppe/stock').set(auth('ppe')).send({ ppeItemId: ids.item, size: '52', quantity: 5, movementType: 'RECEIPT', movementDate: iso(today) }).expect(201);
      let n = await http.get(`/api/ppe/needs/employee/${ids.ivanov}`).set(auth('ppe'));
      expect(n.body.rows[0].status).toBe('NOT_PROVIDED');
      expect((await http.post('/api/ppe/issues').set(auth('ppe')).send({ employeeId: ids.ivanov, ppeItemId: ids.item, quantity: 1, issueDate: iso(today) })).status).toBe(400); // нет размера
      const iss = await http.post('/api/ppe/issues').set(auth('ppe')).send({ employeeId: ids.ivanov, ppeItemId: ids.item, quantity: 1, issueDate: iso(today), size: '52' });
      expect(iss.status).toBe(201);
      expect(iss.body.receiptConfirmed).toBe(false);
      expect(iss.body.plannedReplacementDate).toBeTruthy();
      n = await http.get(`/api/ppe/needs/employee/${ids.ivanov}`).set(auth('ppe'));
      expect(n.body.rows[0].status).toBe('AWAITING_CONFIRMATION');
      await http.post(`/api/ppe/issues/${iss.body.id}/confirm`).set(auth('ppe')).send({ method: 'PAPER_JOURNAL_SIGNATURE' }).expect(201);
      n = await http.get(`/api/ppe/needs/employee/${ids.ivanov}`).set(auth('ppe'));
      expect(n.body.rows[0].status).toBe('PROVIDED');
      const st = await http.get('/api/ppe/stock').set(auth('ppe'));
      expect(st.body.find((s: any) => s.size === '52').quantity).toBe(4);
      await http.post(`/api/ppe/issues/${iss.body.id}/return`).set(auth('ppe')).send({ operationType: 'RETURN', quantity: 1, operationDate: iso(today), reason: 'Увольнение (тест)', toStock: true }).expect(201);
      n = await http.get(`/api/ppe/needs/employee/${ids.ivanov}`).set(auth('ppe'));
      expect(n.body.rows[0].status).toBe('NOT_PROVIDED');
      expect((await http.post(`/api/ppe/issues/${iss.body.id}/return`).set(auth('ppe')).send({ operationType: 'WRITE_OFF', quantity: 1, operationDate: iso(today), reason: 'повтор' })).status).toBe(400);
      ids.issue = iss.body.id;
    });
  });

  describe('Увольнение и сохранность истории', () => {
    it('после увольнения история инструктажей, проверок и СИЗ сохраняется', async () => {
      await http.post(`/api/employees/${ids.ivanov}/dismiss`).set(auth('hr')).send({ dismissalDate: iso(today), reason: 'тест' }).expect(201);
      expect((await http.get(`/api/briefings/employee/${ids.ivanov}`).set(auth('spec'))).body).toHaveLength(1);
      expect((await http.get(`/api/knowledge-checks/employee/${ids.ivanov}`).set(auth('spec'))).body).toHaveLength(1);
      expect((await http.get(`/api/ppe/issues/employee/${ids.ivanov}`).set(auth('spec'))).body).toHaveLength(1);
      const c = await http.get('/api/briefings/compliance').set(auth('spec'));
      expect(c.body.some((x: any) => x.employeeId === ids.ivanov)).toBe(false);
      const hist = await http.get(`/api/reports/briefing-history?employeeId=${ids.ivanov}`).set(auth('spec'));
      expect(hist.body.rows).toHaveLength(1);
    });
  });

  describe('Уведомления, отчёты, журнал', () => {
    it('повторный запуск фонового задания не создаёт дубликатов', async () => {
      await prisma.briefing.create({ data: { briefingTypeId: ids.bt, plannedDate: addDays(today, -2), participants: { create: [{ employeeId: ids.petrov, unitId: ids.u1, positionId: ids.p1 }] } } });
      const r1 = await http.post('/api/notifications/run').set(auth('admin'));
      expect(r1.status).toBe(200);
      const count1 = await prisma.notification.count();
      const tasks1 = await prisma.task.count();
      expect(count1).toBeGreaterThan(0);
      await http.post('/api/notifications/run').set(auth('admin')).expect(200);
      expect(await prisma.notification.count()).toBe(count1);
      expect(await prisma.task.count()).toBe(tasks1);
      const my = await http.get('/api/notifications').set(auth('spec'));
      expect(my.body.total).toBeGreaterThan(0);
      await http.post(`/api/notifications/${my.body.items[0].id}/read`).set(auth('spec')).expect(200);
      // чужое уведомление прочитать нельзя
      expect((await http.post(`/api/notifications/${my.body.items[0].id}/read`).set(auth('head'))).status).toBe(404);
    });

    it('все отчёты формируются; экспорт в XLSX/PDF/CSV', async () => {
      const list = await http.get('/api/reports').set(auth('spec'));
      for (const r of list.body) {
        const q = new URLSearchParams();
        if (r.required?.includes('period')) { q.set('dateFrom', iso(addDays(today, -365))); q.set('dateTo', iso(addDays(today, 365))); }
        if (r.required?.includes('employee')) q.set('employeeId', ids.petrov);
        const res = await http.get(`/api/reports/${r.code}?${q}`).set(auth('spec'));
        expect({ code: r.code, status: res.status }).toEqual({ code: r.code, status: 200 });
        expect(Array.isArray(res.body.rows)).toBe(true);
      }
      for (const f of ['xlsx', 'pdf', 'csv']) {
        const res = await http.get(`/api/reports/summary/export?format=${f}`).set(auth('spec')).buffer(true);
        expect(res.status).toBe(200);
      }
      expect((await http.get('/api/reports/summary/export?format=xlsx').set(auth('hr'))).status).toBe(403);
    });

    it('печатные формы: шаблон-пример помечен как непроверенный', async () => {
      const res = await http.get(`/api/print/ppe-card/${ids.petrov}`).set(auth('spec'));
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/Шаблон не проверен/);
    });

    it('журнал действий фиксирует операции без паролей', async () => {
      await http.post('/api/users').set(auth('admin')).send({ login: 'newuser', fullName: 'Новый', password: 'SecretPass123', roleIds: [] }).expect(201);
      const a = await http.get('/api/admin/audit?pageSize=100').set(auth('admin'));
      const entry = a.body.items.find((x: any) => x.path === '/api/users' && x.method === 'POST');
      expect(entry).toBeTruthy();
      expect(JSON.stringify(entry.details)).not.toMatch(/SecretPass123/);
      expect((await http.get('/api/admin/audit').set(auth('spec'))).status).toBe(403);
    });
  });
});
