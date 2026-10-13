import { ReactNode, useState } from 'react';
import { App, Button, Dropdown, Space, Tag } from 'antd';
import { DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import { download } from '../utils/files';
import { errorText } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function PageHeader({ title, extra }: { title: ReactNode; extra?: ReactNode }) {
  return (
    <div className="page-header">
      <h2>{title}</h2>
      <Space wrap>{extra}</Space>
    </div>
  );
}

export function StatusTag({ map, value }: { map: Record<string, { text: string; color: string }>; value?: string | null }) {
  if (!value) return null;
  const s = map[value] ?? { text: value, color: 'default' };
  return <Tag color={s.color}>{s.text}</Tag>;
}

/** Кнопка экспорта в XLSX / PDF / CSV + печать (HTML) */
export function ExportButton({ url, params, name, print = true }: { url: string; params: Record<string, unknown>; name: string; print?: boolean }) {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!can('reports.export')) return null;
  const run = async (format: string) => {
    setBusy(true);
    try {
      if (format === 'html') {
        const { openPrint } = await import('../utils/files');
        await openPrint(url, { ...params, format });
      } else await download(url, { ...params, format }, `${name}.${format}`);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Space.Compact>
      <Dropdown menu={{ items: [{ key: 'xlsx', label: 'Excel (XLSX)' }, { key: 'pdf', label: 'PDF' }, { key: 'csv', label: 'CSV' }], onClick: (e) => run(e.key) }}>
        <Button icon={<DownloadOutlined />} loading={busy}>Экспорт</Button>
      </Dropdown>
      {print && <Button icon={<PrinterOutlined />} onClick={() => run('html')} title="Печать" />}
    </Space.Compact>
  );
}
