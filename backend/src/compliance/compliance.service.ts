import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UnitTreeService } from '../core/unit-tree.service';
import { SettingsService } from '../core/settings.service';
import { AuthUser } from '../common/auth-user';
import { narrowUnits } from '../common/scope';
import { todayInTz } from '../common/dates';
import { ComplianceStatus, evaluateCompliance, PeriodRule, RuleContext, selectRule } from './rules';
import { fullName } from '../employees/employees.service';

export type ComplianceKind = 'briefing' | 'check';

export interface ComplianceRow {
  kind: ComplianceKind;
  employeeId: string;
  personnelNumber: string;
  fullName: string;
  unitId: string;
  unitName: string;
  positionId: string;
  positionName: string;
  typeId: string;
  typeName: string;
  ruleId: string;
  ruleBasis: string;
  status: ComplianceStatus;
  dueDate: Date | null;
  daysLeft: number | null;
  reason: string;
  lastDate: Date | null;
  plannedDate: Date | null;
  plannedId: string | null;
}

export interface ComplianceFilter {
  unitIds?: string[];
  positionId?: string;
  typeId?: string;
  employeeId?: string;
  statuses?: ComplianceStatus[];
}

interface LastRow { employee_id: string; type_id: string; date: Date; next_due: Date | null }
interface PlanRow { employee_id: string; type_id: string; date: Date | null; event_id: string }

@Injectable()
export class ComplianceService {
  constructor(private prisma: PrismaService, private tree: UnitTreeService, private settings: SettingsService) {}

  async briefingRules(): Promise<PeriodRule[]> {
    const rs = await this.prisma.briefingRule.findMany({ where: { isActive: true, briefingType: { isActive: true } } });
    return rs.map((r) => ({ ...r, typeId: r.briefingTypeId }));
  }

  async checkRules(): Promise<PeriodRule[]> {
    const rs = await this.prisma.knowledgeCheckRule.findMany({ where: { isActive: true, checkType: { isActive: true } } });
    return rs.map((r) => ({ ...r, typeId: r.checkTypeId }));
  }

  /** Контекст для подбора правила по должности/подразделению */
  async contextFor(positionId: string, unitId: string): Promise<RuleContext> {
    const [pos, chains] = await Promise.all([
      this.prisma.position.findUnique({ where: { id: positionId }, select: { workCategory: true } }),
      this.tree.ancestorsMap(),
    ]);
    return { positionId, workCategory: pos?.workCategory ?? null, unitChain: chains.get(unitId) ?? [unitId] };
  }

  private async lastTransfers(): Promise<Map<string, Date>> {
    const rows = await this.prisma.$queryRaw<{ employee_id: string; d: Date }[]>`
      SELECT DISTINCT ON (employee_id) employee_id, effective_date AS d
      FROM employee_history WHERE change_type = 'TRANSFER'
      ORDER BY employee_id, effective_date DESC`;
    return new Map(rows.map((r) => [r.employee_id, r.d]));
  }

  private keyed<T extends { employee_id: string; type_id: string }>(rows: T[]) {
    return new Map(rows.map((r) => [`${r.employee_id}|${r.type_id}`, r]));
  }

  async compute(user: AuthUser, kind: ComplianceKind, f: ComplianceFilter = {}): Promise<ComplianceRow[]> {
    const today = todayInTz();
    const upcomingDays = Number(await this.settings.get('deadlines.upcomingDays')) || 30;
    let requested = f.unitIds;
    if (requested?.length) requested = await this.tree.withDescendants(requested);
    const units = narrowUnits(user, requested);
    const where: Prisma.EmployeeWhereInput = {
      status: { not: 'DISMISSED' },
      unitId: units ? { in: units } : undefined,
      positionId: f.positionId,
      id: f.employeeId,
    };
    const [employees, rules, chains, transfers, types] = await Promise.all([
      this.prisma.employee.findMany({ where, include: { unit: { select: { name: true } }, position: { select: { name: true, workCategory: true } } } }),
      kind === 'briefing' ? this.briefingRules() : this.checkRules(),
      this.tree.ancestorsMap(),
      this.lastTransfers(),
      kind === 'briefing'
        ? this.prisma.briefingType.findMany({ where: { isActive: true }, select: { id: true, name: true } })
        : this.prisma.knowledgeCheckType.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);
    if (!employees.length || !rules.length) return [];
    const typeIds = [...new Set(rules.map((r) => r.typeId))].filter((t) => !f.typeId || t === f.typeId);
    const typeNames = new Map(types.map((t) => [t.id, t.name]));

    let last: Map<string, LastRow>, failed: Map<string, LastRow> = new Map(), planned: Map<string, PlanRow>;
    if (kind === 'briefing') {
      last = this.keyed(await this.prisma.$queryRaw<LastRow[]>`
        SELECT DISTINCT ON (bp.employee_id, b.briefing_type_id) bp.employee_id, b.briefing_type_id AS type_id, b.conducted_date AS date, bp.next_due_date AS next_due
        FROM briefing_participants bp
        JOIN briefings b ON b.id = bp.briefing_id
        JOIN briefing_types bt ON bt.id = b.briefing_type_id
        WHERE b.status = 'CONDUCTED' AND bp.result = 'COMPLETED' AND (bt.requires_confirmation = false OR bp.confirmed = true)
        ORDER BY bp.employee_id, b.briefing_type_id, b.conducted_date DESC`);
      planned = this.keyed(await this.prisma.$queryRaw<PlanRow[]>`
        SELECT DISTINCT ON (bp.employee_id, b.briefing_type_id) bp.employee_id, b.briefing_type_id AS type_id, b.planned_date AS date, b.id AS event_id
        FROM briefing_participants bp JOIN briefings b ON b.id = bp.briefing_id
        WHERE b.status = 'PLANNED'
        ORDER BY bp.employee_id, b.briefing_type_id, b.planned_date ASC NULLS LAST`);
    } else {
      last = this.keyed(await this.prisma.$queryRaw<LastRow[]>`
        SELECT DISTINCT ON (p.employee_id, c.check_type_id) p.employee_id, c.check_type_id AS type_id, c.conducted_date AS date, r.next_check_date AS next_due
        FROM knowledge_check_results r
        JOIN knowledge_check_participants p ON p.id = r.participant_id
        JOIN knowledge_checks c ON c.id = p.check_id
        WHERE c.status = 'CONDUCTED' AND r.outcome = 'PASSED'
        ORDER BY p.employee_id, c.check_type_id, c.conducted_date DESC`);
      failed = this.keyed(await this.prisma.$queryRaw<LastRow[]>`
        SELECT DISTINCT ON (p.employee_id, c.check_type_id) p.employee_id, c.check_type_id AS type_id, c.conducted_date AS date, r.next_check_date AS next_due
        FROM knowledge_check_results r
        JOIN knowledge_check_participants p ON p.id = r.participant_id
        JOIN knowledge_checks c ON c.id = p.check_id
        WHERE c.status = 'CONDUCTED' AND r.outcome = 'FAILED'
        ORDER BY p.employee_id, c.check_type_id, c.conducted_date DESC`);
      planned = this.keyed(await this.prisma.$queryRaw<PlanRow[]>`
        SELECT DISTINCT ON (p.employee_id, c.check_type_id) p.employee_id, c.check_type_id AS type_id, c.planned_date AS date, c.id AS event_id
        FROM knowledge_check_participants p JOIN knowledge_checks c ON c.id = p.check_id
        WHERE c.status = 'PLANNED'
        ORDER BY p.employee_id, c.check_type_id, c.planned_date ASC NULLS LAST`);
    }

    const out: ComplianceRow[] = [];
    for (const e of employees) {
      const ctx: RuleContext = { positionId: e.positionId, workCategory: e.position.workCategory, unitChain: chains.get(e.unitId) ?? [e.unitId] };
      for (const typeId of typeIds) {
        const rule = selectRule(rules, typeId, ctx, today);
        if (!rule) continue;
        const key = `${e.id}|${typeId}`;
        const l = last.get(key);
        const fl = failed.get(key);
        const p = planned.get(key);
        const res = evaluateCompliance({
          rule, today, upcomingDays, hireDate: e.hireDate, lastTransferDate: transfers.get(e.id) ?? null,
          lastDone: l ? { date: l.date, nextDueDate: l.next_due } : null,
          lastFailed: fl ? { date: fl.date, nextDueDate: fl.next_due } : null,
        });
        if (f.statuses?.length && !f.statuses.includes(res.status)) continue;
        out.push({
          kind, employeeId: e.id, personnelNumber: e.personnelNumber, fullName: fullName(e), unitId: e.unitId, unitName: e.unit.name,
          positionId: e.positionId, positionName: e.position.name, typeId, typeName: typeNames.get(typeId) ?? '', ruleId: rule.id, ruleBasis: rule.basis,
          status: res.status, dueDate: res.dueDate, daysLeft: res.daysLeft, reason: res.reason, lastDate: l?.date ?? null,
          plannedDate: p?.date ?? null, plannedId: p?.event_id ?? null,
        });
      }
    }
    out.sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) || a.fullName.localeCompare(b.fullName, 'ru'));
    return out;
  }
}
