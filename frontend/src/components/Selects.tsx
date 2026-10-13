import { useMemo, useState } from 'react';
import { Select, SelectProps, TreeSelect, TreeSelectProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { unitTree, useBriefingTypes, useCheckTypes, usePositions, useUnits } from '../api/refs';
import { fio } from '../utils/format';

export function UnitSelect(props: TreeSelectProps & { multiple?: boolean }) {
  const { data = [], isLoading } = useUnits();
  const tree = useMemo(() => unitTree(data), [data]);
  return (
    <TreeSelect allowClear showSearch treeNodeFilterProp="title" treeDefaultExpandAll placeholder="Подразделение" loading={isLoading}
      treeData={tree} style={{ minWidth: 220 }} popupMatchSelectWidth={false} maxTagCount={2} {...props} />
  );
}

export function PositionSelect(props: SelectProps) {
  const { data = [], isLoading } = usePositions();
  return <Select allowClear showSearch optionFilterProp="label" placeholder="Должность" loading={isLoading} style={{ minWidth: 200 }} popupMatchSelectWidth={false}
    options={data.map((p) => ({ value: p.id, label: p.isActive ? p.name : `${p.name} (архив)` }))} {...props} />;
}

export function BriefingTypeSelect(props: SelectProps) {
  const { data = [] } = useBriefingTypes();
  return <Select allowClear placeholder="Вид инструктажа" style={{ minWidth: 200 }} popupMatchSelectWidth={false}
    options={data.filter((t) => t.isActive).map((t) => ({ value: t.id, label: t.name }))} {...props} />;
}

export function CheckTypeSelect(props: SelectProps) {
  const { data = [] } = useCheckTypes();
  return <Select allowClear placeholder="Вид проверки" style={{ minWidth: 200 }} popupMatchSelectWidth={false}
    options={data.filter((t) => t.isActive).map((t) => ({ value: t.id, label: t.name }))} {...props} />;
}

/** Поиск сотрудника по ФИО / табельному номеру (серверный) */
export function EmployeeSelect({ empStatus = 'CURRENT', unitIds, initialOptions = [], ...props }: Omit<SelectProps, 'status'> & { empStatus?: string; unitIds?: string[]; initialOptions?: { value: string; label: string }[] }) {
  const [search, setSearch] = useState('');
  const { data, isFetching } = useQuery({
    queryKey: ['employee-search', search, empStatus, unitIds],
    queryFn: () => api.get('/employees', { params: { search: search || undefined, pageSize: 30, status: empStatus, unitIds: unitIds?.join(',') || undefined } }).then((r) => r.data.items),
    staleTime: 30_000,
  });
  const options = useMemo(() => {
    const m = new Map(initialOptions.map((o) => [o.value, o]));
    for (const e of data ?? []) m.set(e.id, { value: e.id, label: `${fio(e)} (${e.personnelNumber}) — ${e.position?.name ?? ''}` });
    return [...m.values()];
  }, [data, initialOptions]);
  return <Select showSearch allowClear filterOption={false} onSearch={setSearch} loading={isFetching} placeholder="ФИО или табельный номер"
    options={options} style={{ minWidth: 260 }} popupMatchSelectWidth={false} notFoundContent={isFetching ? 'Поиск…' : 'Не найдено'} {...props} />;
}
