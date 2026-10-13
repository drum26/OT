import { App, Button, Space } from 'antd';
import { useState } from 'react';
import { api, errorText } from '../../api/client';
import { EmployeeSelect, UnitSelect } from '../../components/Selects';
import { fio } from '../../utils/format';

/** Выбор группы сотрудников: поиск по одному или добавление всех действующих сотрудников подразделения */
export function GroupPicker({ value = [], onChange, labels, setLabels }: {
  value?: string[]; onChange?: (v: string[]) => void; labels: Record<string, string>; setLabels: (l: Record<string, string>) => void;
}) {
  const { message } = App.useApp();
  const [unit, setUnit] = useState<string>();
  const addUnit = async () => {
    if (!unit) return;
    try {
      const r = await api.get('/employees', { params: { unitIds: unit, status: 'CURRENT', pageSize: 500 } });
      const items = r.data.items as any[];
      const l = { ...labels };
      for (const e of items) l[e.id] = `${fio(e)} (${e.personnelNumber})`;
      setLabels(l);
      onChange?.([...new Set([...value, ...items.map((e) => e.id)])]);
      if (r.data.total > 500) message.warning('Добавлены первые 500 сотрудников подразделения');
    } catch (e) {
      message.error(errorText(e));
    }
  };
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <EmployeeSelect mode="multiple" value={value} onChange={(v) => onChange?.(v as string[])} style={{ width: '100%' }} maxTagCount={30}
        initialOptions={value.map((id) => ({ value: id, label: labels[id] ?? id }))}
        onSelect={(_: unknown, o: any) => setLabels({ ...labels, [o.value]: o.label })} />
      <Space.Compact>
        <UnitSelect value={unit} onChange={(v) => setUnit(v as string)} placeholder="Добавить всех из подразделения" style={{ minWidth: 300 }} />
        <Button onClick={addUnit} disabled={!unit}>Добавить</Button>
        {value.length > 0 && <Button onClick={() => onChange?.([])}>Очистить ({value.length})</Button>}
      </Space.Compact>
    </Space>
  );
}
