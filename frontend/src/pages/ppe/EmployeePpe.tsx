import { Button, Card, Dropdown, Space, Table, Tag } from 'antd';
import { PlusOutlined, PrinterOutlined, MoreOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { StatusTag } from '../../components/Common';
import { CONFIRM_TEXT, fmtDate, ISSUE_STATUS, PPE_STATUS } from '../../utils/format';
import { openPrint } from '../../utils/files';
import { ConfirmReceiptModal, IssueModal, ReplacementDateModal, ReturnModal } from './PpeModals';

const RET: Record<string, string> = { RETURN: 'Возврат', WRITE_OFF: 'Списание', REPLACEMENT: 'Замена' };

export function EmployeePpe({ employee }: { employee: any }) {
  const { can } = useAuth();
  const [issueFor, setIssueFor] = useState<{ itemId?: string } | null>(null);
  const [ret, setRet] = useState<any>(null);
  const [conf, setConf] = useState<any>(null);
  const [repl, setRepl] = useState<any>(null);
  const needs = useQuery({ queryKey: ['ppe-needs-emp', employee.id], queryFn: () => api.get(`/ppe/needs/employee/${employee.id}`).then((r) => r.data) });
  const issues = useQuery({ queryKey: ['ppe-issues-emp', employee.id], queryFn: () => api.get(`/ppe/issues/employee/${employee.id}`).then((r) => r.data as any[]) });
  const done = (changed?: boolean) => { setIssueFor(null); setRet(null); setConf(null); setRepl(null); if (changed) { needs.refetch(); issues.refetch(); } };
  const canIssue = can('ppe.issue') && employee.status !== 'DISMISSED';
  return (
    <>
      <Card size="small" title="Обеспечение по нормам должности" extra={<Space>
        {(can('reports.export') || can('ppe.issue')) && <Button icon={<PrinterOutlined />} onClick={() => openPrint(`/print/ppe-card/${employee.id}`)}>Личная карточка</Button>}
        {canIssue && <Button type="primary" icon={<PlusOutlined />} onClick={() => setIssueFor({})}>Выдать СИЗ</Button>}
      </Space>}>
        <Table size="small" rowKey="ppeItemId" loading={needs.isFetching} pagination={false} dataSource={needs.data?.rows}
          locale={{ emptyText: employee.status === 'DISMISSED' ? 'Сотрудник уволен' : 'Для должности не установлены действующие нормы' }}
          columns={[
            { title: 'СИЗ', dataIndex: 'itemName' },
            { title: 'По норме', render: (_, r: any) => (r.standardId ? `${r.normQty} ${r.unit}` : '—') },
            { title: 'Срок носки', render: (_, r: any) => (r.wearMonths ? `${r.wearMonths} мес.` : r.wearCondition ?? '') },
            { title: 'Выдано', dataIndex: 'issuedQty', align: 'right' },
            { title: 'Подтверждено', dataIndex: 'confirmedQty', align: 'right' },
            { title: 'Требуется выдать', dataIndex: 'toIssueQty', align: 'right', render: (v) => (v ? <b>{v}</b> : 0) },
            { title: 'Последняя выдача', render: (_, r: any) => fmtDate(r.lastIssueDate) },
            { title: 'Плановая замена', render: (_, r: any) => fmtDate(r.nextReplacementDate) },
            { title: 'Статус', render: (_, r: any) => <StatusTag map={PPE_STATUS} value={r.status} /> },
            { title: 'Основание', dataIndex: 'basis', ellipsis: true },
            { title: '', render: (_, r: any) => canIssue && r.toIssueQty > 0 && <Button size="small" onClick={() => setIssueFor({ itemId: r.ppeItemId })}>Выдать</Button> },
          ]} />
      </Card>
      <Card size="small" title="История операций" style={{ marginTop: 12 }}>
        <Table size="small" rowKey="id" loading={issues.isFetching} dataSource={issues.data} pagination={{ pageSize: 20 }}
          expandable={{ rowExpandable: (r) => r.returns.length > 0, expandedRowRender: (r) => (
            <ul style={{ margin: 0 }}>{r.returns.map((x: any) => <li key={x.id}>{fmtDate(x.operationDate)}: {RET[x.operationType]} {x.quantity} — {x.reason}{x.toStock ? ' (на склад)' : ''}</li>)}</ul>
          ) }}
          columns={[
            { title: 'Дата выдачи', render: (_, r) => fmtDate(r.issueDate) },
            { title: 'СИЗ', render: (_, r) => r.ppeItem.name },
            { title: 'Размер', dataIndex: 'size' },
            { title: 'Кол-во', render: (_, r) => `${r.activeQty}/${r.quantity}` },
            { title: 'Плановая замена', render: (_, r) => <>{fmtDate(r.plannedReplacementDate)}{r.replacementManual && <Tag style={{ marginLeft: 4 }} title={r.replacementBasis}>скорр.</Tag>}</> },
            { title: 'Получение', render: (_, r) => (r.receiptConfirmed ? <Tag color="green">{CONFIRM_TEXT[r.receiptMethod] ?? 'подтверждено'}</Tag> : <Tag color="gold">не подтверждено</Tag>) },
            { title: 'Статус', render: (_, r) => <StatusTag map={ISSUE_STATUS} value={r.status} /> },
            { title: 'Выдал', dataIndex: 'issuerName' },
            {
              title: '', render: (_, r) => can('ppe.issue') && ['ACTIVE', 'PARTIALLY_CLOSED'].includes(r.status) && (
                <Dropdown menu={{ items: [
                  !r.receiptConfirmed && { key: 'c', label: 'Подтвердить получение', onClick: () => setConf(r) },
                  { key: 'r', label: 'Возврат / списание / замена', onClick: () => setRet(r) },
                  { key: 'd', label: 'Скорректировать дату замены', onClick: () => setRepl(r) },
                ].filter(Boolean) as any }}><Button size="small" icon={<MoreOutlined />} /></Dropdown>
              ),
            },
          ]} />
      </Card>
      <IssueModal open={!!issueFor} employeeId={employee.id} employeeLabel={employee.fullName} itemId={issueFor?.itemId} onClose={done} />
      <ReturnModal issue={ret} onClose={done} />
      <ConfirmReceiptModal issue={conf} onClose={done} />
      <ReplacementDateModal issue={repl} onClose={done} />
    </>
  );
}
