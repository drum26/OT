import { Alert, Button, Card, DatePicker, Empty, List, Select, Space, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, errorText, qs } from '../api/client';
import { ExportButton, PageHeader } from '../components/Common';
import { BriefingTypeSelect, CheckTypeSelect, EmployeeSelect, PositionSelect, UnitSelect } from '../components/Selects';
import { fmtDate, toApiDate, toDayjs } from '../utils/format';
import { useUrlFilters } from '../utils/useUrlFilters';

export function ReportsPage() {
  const [f, setF] = useUrlFilters<any>(['unitIds']);
  const [run, setRun] = useState(0);
  const { data: list = [] } = useQuery({ queryKey: ['reports'], queryFn: () => api.get('/reports').then((r) => r.data as any[]) });
  const def = list.find((r) => r.code === f.code);
  const params = { unitIds: f.unitIds, dateFrom: f.dateFrom, dateTo: f.dateTo, typeId: f.typeId, employeeId: f.employeeId, positionId: f.positionId, outcome: f.outcome };
  const report = useQuery({
    queryKey: ['report', f.code, params, run],
    queryFn: () => api.get(`/reports/${f.code}`, { params: qs(params) }).then((r) => r.data),
    enabled: !!def && run > 0,
  });
  const groups = useMemo(() => [...new Set(list.map((r) => r.group))], [list]);
  const has = (k: string) => def?.filters.includes(k);
  const columns = (report.data?.columns ?? []).map((c: any) => ({
    title: c.title, dataIndex: c.key, align: c.type === 'number' ? 'right' : undefined,
    sorter: (a: any, b: any) => String(a[c.key] ?? '').localeCompare(String(b[c.key] ?? ''), 'ru', { numeric: true }),
    render: (v: any) => (c.type === 'date' ? fmtDate(v) : typeof v === 'boolean' ? (v ? 'да' : 'нет') : v),
  }));
  return (
    <>
      <PageHeader title="Отчёты" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Card size="small" style={{ width: 340 }}>
          {groups.map((g) => (
            <div key={g}>
              <Typography.Text type="secondary">{g}</Typography.Text>
              <List size="small" dataSource={list.filter((r) => r.group === g)} renderItem={(r: any) => (
                <List.Item style={{ cursor: 'pointer', background: r.code === f.code ? '#e6f4ea' : undefined, paddingLeft: 8 }} onClick={() => { setF({ code: r.code }); setRun(0); }}>{r.title}</List.Item>
              )} />
            </div>
          ))}
        </Card>
        <div style={{ flex: 1, minWidth: 400 }}>
          {!def ? <Empty description="Выберите отчёт" /> : (
            <Card size="small" title={def.title}>
              <div className="filters">
                {has('unitIds') && <UnitSelect multiple value={f.unitIds} onChange={(v) => setF({ unitIds: v as string[] })} />}
                {has('position') && <PositionSelect value={f.positionId} onChange={(v) => setF({ positionId: v })} />}
                {has('period') && <DatePicker.RangePicker format="DD.MM.YYYY" value={[toDayjs(f.dateFrom), toDayjs(f.dateTo)]} onChange={(v) => setF({ dateFrom: toApiDate(v?.[0]) ?? undefined, dateTo: toApiDate(v?.[1]) ?? undefined })} />}
                {has('briefingType') && <BriefingTypeSelect value={f.typeId} onChange={(v) => setF({ typeId: v })} />}
                {has('checkType') && <CheckTypeSelect value={f.typeId} onChange={(v) => setF({ typeId: v })} />}
                {has('employee') && <EmployeeSelect value={f.employeeId} onChange={(v) => setF({ employeeId: v })} empStatus="ALL" />}
                {has('outcome') && <Select allowClear placeholder="Результат" value={f.outcome} onChange={(v) => setF({ outcome: v })} style={{ width: 200 }}
                  options={[{ value: 'PASSED', label: 'Удовлетворительно' }, { value: 'FAILED', label: 'Неудовлетворительно' }, { value: 'ABSENT', label: 'Отсутствовал' }]} />}
                <Space>
                  <Button type="primary" onClick={() => setRun(run + 1)} loading={report.isFetching}>Сформировать</Button>
                  <ExportButton url={`/reports/${def.code}/export`} params={params} name={def.title} />
                </Space>
              </div>
              {def.required?.includes('period') && <Typography.Text type="secondary">Период обязателен. </Typography.Text>}
              {report.error && <Alert type="error" message={errorText(report.error)} />}
              {report.data && <>
                <Typography.Paragraph type="secondary">{report.data.subtitle}</Typography.Paragraph>
                <Table size="small" rowKey={(_, i) => String(i)} dataSource={report.data.rows} columns={columns} scroll={{ x: true }} pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `Строк: ${t}` }} />
              </>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
