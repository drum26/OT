import { Alert, Card, Col, DatePicker, Empty, List, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { WarningOutlined } from '@ant-design/icons';
import { api, errorText, qs } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { EmployeeSelect, PositionSelect, UnitSelect } from '../components/Selects';
import { PageHeader, StatusTag } from '../components/Common';
import { COMPLIANCE_STATUS, fmtDate, toApiDate, toDayjs } from '../utils/format';
import { useUrlFilters } from '../utils/useUrlFilters';

export function DashboardPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [f, setF] = useUrlFilters<{ unitIds: string[]; positionId: string; responsibleId: string; dateFrom: string; dateTo: string }>(['unitIds']);
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard', f], queryFn: () => api.get('/dashboard', { params: qs(f) }).then((r) => r.data) });
  const u = f.unitIds?.length ? `&unitIds=${f.unitIds.join(',')}` : '';
  const pos = f.positionId ? `&positionId=${f.positionId}` : '';
  const period = `&dateFrom=${data ? data.period.from.slice(0, 10) : ''}&dateTo=${data ? data.period.to.slice(0, 10) : ''}`;

  const Kpi = ({ title, value, to, danger, hint }: { title: string; value?: number; to: string; danger?: boolean; hint?: string }) => (
    <Col xs={24} sm={12} md={8} xl={6} xxl={4}>
      <Card className="kpi" size="small" onClick={() => nav(to)} loading={isLoading} hoverable>
        <Statistic title={title} value={value ?? 0} valueStyle={{ color: danger && value ? '#cf1322' : undefined }} />
        {hint && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{hint}</Typography.Text>}
      </Card>
    </Col>
  );

  return (
    <>
      <PageHeader title="Главная" />
      <div className="filters">
        <UnitSelect multiple value={f.unitIds} onChange={(v) => setF({ unitIds: v as string[] })} />
        <PositionSelect value={f.positionId} onChange={(v) => setF({ positionId: v })} />
        <EmployeeSelect placeholder="Ответственное лицо" value={f.responsibleId} onChange={(v) => setF({ responsibleId: v })} />
        <DatePicker.RangePicker format="DD.MM.YYYY" placeholder={['Период с', 'по']} value={[toDayjs(f.dateFrom), toDayjs(f.dateTo)]}
          onChange={(v) => setF({ dateFrom: toApiDate(v?.[0]) ?? undefined, dateTo: toApiDate(v?.[1]) ?? undefined })} />
      </div>
      {error && <Alert type="error" message={errorText(error)} />}
      <Row gutter={[12, 12]}>
        <Kpi title="Действующих сотрудников" value={data?.activeEmployees} to={`/employees?status=CURRENT${u}${pos}`} />
        {data?.briefings && <>
          <Kpi title="Сотрудников с просроченными инструктажами" value={data.briefings.overdueEmployees} danger to={`/briefings?tab=compliance&statuses=OVERDUE,MISSING${u}${pos}`}
            hint={data.briefings.overduePlannedEvents ? `в т.ч. просрочено запланированных: ${data.briefings.overduePlannedEvents}` : undefined} />
          <Kpi title="Предстоящих инструктажей (запланировано)" value={data.briefings.upcomingEvents} to={`/briefings?status=PLANNED${period}${u}`}
            hint={`по правилам срок наступает у ${data.briefings.upcomingByRules} чел.`} />
        </>}
        {data?.checks && <>
          <Kpi title="Просроченных проверок знаний (сотрудников)" value={data.checks.overdueEmployees} danger to={`/checks?tab=compliance&statuses=OVERDUE,MISSING${u}${pos}`} />
          <Kpi title="Неудовлетворительные результаты" value={data.checks.failedEmployees} danger to={`/checks?tab=compliance&statuses=FAILED${u}${pos}`} />
          <Kpi title="Предстоящих проверок знаний" value={data.checks.upcomingEvents} to={`/checks?status=PLANNED${period}${u}`} hint={`по правилам срок наступает у ${data.checks.upcomingByRules} чел.`} />
        </>}
        {data?.ppe && <Kpi title="Требуется выдача или замена СИЗ (сотрудников)" value={data.ppe.needEmployees} danger to={`/ppe?tab=needs&statuses=NOT_PROVIDED,PARTIAL,REPLACEMENT_OVERDUE${u}${pos}`}
          hint={data.ppe.awaitingConfirmation ? `ожидает подтверждения получения: ${data.ppe.awaitingConfirmation}` : undefined} />}
        {data?.tasks && <Kpi title="Незакрытых задач" value={data.tasks.open} to="/tasks?status=ACTIVE" hint={data.tasks.overdue ? `просрочено: ${data.tasks.overdue}` : undefined} danger={false} />}
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} xl={10}>
          <Card title="Ближайшие мероприятия" size="small" loading={isLoading} extra={can('calendar.read') && <Link to="/calendar">Календарь</Link>}>
            <List size="small" dataSource={data?.nearestEvents ?? []} locale={{ emptyText: <Empty description="Нет запланированных мероприятий" /> }}
              renderItem={(e: any) => (
                <List.Item>
                  <List.Item.Meta title={<Link to={e.link}>{fmtDate(e.date)} — {e.title}</Link>} description={`Участников: ${e.count}${e.responsible ? `; ответственный: ${e.responsible}` : ''}`} />
                </List.Item>
              )} />
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title={<Space><WarningOutlined style={{ color: '#cf1322' }} />Критические нарушения сроков</Space>} size="small" loading={isLoading}>
            <Table size="small" scroll={{ x: 760 }} rowKey={(r: any) => `${r.employeeId}-${r.kind}-${r.typeName}`} pagination={false} dataSource={data?.critical ?? []}
              rowClassName={(r: any) => (r.status === 'FAILED' ? 'row-failed' : '')}
              columns={[
                { title: 'Сотрудник', render: (_, r: any) => <Link to={`/employees/${r.employeeId}`}>{r.fullName}</Link> },
                { title: 'Подразделение', dataIndex: 'unitName' },
                { title: 'Мероприятие', render: (_, r: any) => `${r.kind === 'briefing' ? 'Инструктаж' : 'Проверка знаний'}: ${r.typeName}` },
                { title: 'Срок', render: (_, r: any) => fmtDate(r.dueDate) },
                { title: 'Просрочка, дн.', dataIndex: 'daysOverdue', align: 'right' },
                { title: 'Состояние', render: (_, r: any) => <StatusTag map={COMPLIANCE_STATUS} value={r.status} /> },
              ]} />
          </Card>
        </Col>
      </Row>

      <Card title="Сводка по подразделениям" size="small" style={{ marginTop: 12 }} loading={isLoading}>
        <Table size="small" rowKey="unitId" pagination={false} dataSource={data?.units ?? []} scroll={{ x: 900 }}
          columns={[
            { title: 'Подразделение', dataIndex: 'unitName', render: (v, r: any) => <Link to={`/employees?unitIds=${r.unitId}`}>{v}</Link> },
            { title: 'Работников', dataIndex: 'employees', align: 'right' },
            { title: 'Просрочен инструктаж', dataIndex: 'briefingOverdue', align: 'right', render: (v, r: any) => v ? <Link to={`/briefings?tab=compliance&statuses=OVERDUE,MISSING&unitIds=${r.unitId}`}><Tag color="red">{v}</Tag></Link> : 0 },
            { title: 'Просрочена проверка знаний', dataIndex: 'checkOverdue', align: 'right', render: (v, r: any) => v ? <Link to={`/checks?tab=compliance&statuses=OVERDUE,MISSING&unitIds=${r.unitId}`}><Tag color="red">{v}</Tag></Link> : 0 },
            { title: 'Неудовл. результат', dataIndex: 'checkFailed', align: 'right', render: (v, r: any) => v ? <Link to={`/checks?tab=compliance&statuses=FAILED&unitIds=${r.unitId}`}><Tag color="magenta">{v}</Tag></Link> : 0 },
            { title: 'Требуется СИЗ', dataIndex: 'ppeNeed', align: 'right', render: (v, r: any) => v ? <Link to={`/ppe?tab=needs&statuses=NOT_PROVIDED,PARTIAL,REPLACEMENT_OVERDUE&unitIds=${r.unitId}`}><Tag color="orange">{v}</Tag></Link> : 0 },
            { title: 'Открытые задачи', dataIndex: 'openTasks', align: 'right' },
          ]} />
      </Card>
    </>
  );
}
