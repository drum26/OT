import { Badge, Button, Calendar, Card, List, Radio, Select, Space, Tag, Typography } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { api, qs } from '../api/client';
import { PageHeader } from '../components/Common';
import { EmployeeSelect, UnitSelect } from '../components/Selects';
import { EVENT_STATUS, fmtDate, TASK_STATUS } from '../utils/format';

const TYPES: Record<string, { label: string; color: string }> = {
  BRIEFING: { label: 'Инструктажи', color: 'blue' }, CHECK: { label: 'Проверки знаний', color: 'purple' }, PPE_REPLACEMENT: { label: 'Замена СИЗ', color: 'orange' },
  TASK: { label: 'Задачи', color: 'cyan' }, CONTROL_EVENT: { label: 'Контрольные мероприятия', color: 'geekblue' },
};
type Mode = 'day' | 'week' | 'month' | 'list';

function EventItem({ e }: { e: any }) {
  const st = e.type === 'TASK' || e.type === 'CONTROL_EVENT' ? TASK_STATUS[e.status] : EVENT_STATUS[e.status];
  return (
    <List.Item>
      <List.Item.Meta
        title={<Space wrap><Tag color={TYPES[e.type].color}>{TYPES[e.type].label}</Tag><Link to={e.link}>{e.title}</Link>{e.overdue && <Tag color="red">просрочено</Tag>}{st && !e.overdue && <Tag color={st.color}>{st.text}</Tag>}</Space>}
        description={<>{fmtDate(e.date)}{e.responsible && ` · ответственный: ${e.responsible}`}{e.units?.length > 0 && ` · ${e.units.join(', ')}`}{e.count ? ` · участников: ${e.count}` : ''}</>} />
    </List.Item>
  );
}

export function CalendarPage() {
  const [mode, setMode] = useState<Mode>('month');
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [responsibleId, setResponsibleId] = useState<string>();
  const range = useMemo(() => {
    if (mode === 'day') return [date, date];
    if (mode === 'week') return [date.startOf('week'), date.endOf('week')];
    if (mode === 'list') return [date.startOf('month'), date.add(2, 'month').endOf('month')];
    return [date.startOf('month').startOf('week'), date.endOf('month').endOf('week')];
  }, [mode, date]);
  const params = { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), unitIds, types, responsibleId };
  const { data = [], isFetching } = useQuery({ queryKey: ['calendar', params], queryFn: () => api.get('/calendar', { params: qs(params) }).then((r) => r.data as any[]) });
  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const e of data) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [data]);
  const step = (dir: number) => setDate(date.add(dir, mode === 'day' ? 'day' : mode === 'week' ? 'week' : 'month'));
  const days = mode === 'week' ? Array.from({ length: 7 }, (_, i) => range[0].add(i, 'day')) : [date];

  return (
    <>
      <PageHeader title="Календарь мероприятий" />
      <div className="filters">
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} optionType="button" options={[{ value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }, { value: 'list', label: 'Список' }]} />
        <Space.Compact><Button icon={<LeftOutlined />} onClick={() => step(-1)} /><Button onClick={() => setDate(dayjs())}>Сегодня</Button><Button icon={<RightOutlined />} onClick={() => step(1)} /></Space.Compact>
        <Typography.Text strong style={{ alignSelf: 'center', minWidth: 0 }}>{mode === 'month' || mode === 'list' ? date.format('MMMM YYYY') : mode === 'week' ? `${range[0].format('DD.MM')} — ${range[1].format('DD.MM.YYYY')}` : date.format('DD MMMM YYYY, dddd')}</Typography.Text>
        <Select mode="multiple" allowClear placeholder="Типы мероприятий" value={types} onChange={setTypes} style={{ minWidth: 260 }} options={Object.entries(TYPES).map(([value, t]) => ({ value, label: t.label }))} />
        <UnitSelect multiple value={unitIds} onChange={(v) => setUnitIds(v as string[])} />
        <EmployeeSelect placeholder="Ответственный" value={responsibleId} onChange={(v) => setResponsibleId(v)} empStatus="ALL" />
      </div>
      {mode === 'month' && (
        <Card size="small" loading={isFetching && !data.length}>
          <Calendar value={date} onSelect={(d, info) => { setDate(d); if (info.source === 'date') setMode('day'); }} headerRender={() => null}
            cellRender={(d, info) => {
              if (info.type !== 'date') return info.originNode;
              const list = byDay.get(d.format('YYYY-MM-DD')) ?? [];
              return (
                <div>
                  {list.slice(0, 3).map((e) => <div key={e.id} className="cal-cell-item"><Badge color={e.overdue ? 'red' : TYPES[e.type].color} text={e.title} /></div>)}
                  {list.length > 3 && <div className="cal-cell-item muted">ещё {list.length - 3}…</div>}
                </div>
              );
            }} />
        </Card>
      )}
      {(mode === 'day' || mode === 'week') && days.map((d) => (
        <Card key={d.format('YYYY-MM-DD')} size="small" title={d.format('dddd, DD.MM.YYYY')} style={{ marginBottom: 8 }} loading={isFetching}>
          <List size="small" dataSource={byDay.get(d.format('YYYY-MM-DD')) ?? []} locale={{ emptyText: 'Мероприятий нет' }} renderItem={(e) => <EventItem e={e} />} />
        </Card>
      ))}
      {mode === 'list' && (
        <Card size="small" loading={isFetching}>
          <List size="small" dataSource={data} pagination={{ pageSize: 50 }} locale={{ emptyText: 'Мероприятий нет' }} renderItem={(e) => <EventItem e={e} />} />
        </Card>
      )}
    </>
  );
}
