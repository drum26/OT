import { App, Button, Input, Popconfirm, Table, Upload } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorText } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { download } from '../utils/files';
import { fmtDateTime } from '../utils/format';

/** Прикреплённые документы (подтверждения, сканы протоколов и т.п.). Допустимые типы проверяются на сервере. */
export function Attachments({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { can, me } = useAuth();
  const { message } = App.useApp();
  const [desc, setDesc] = useState('');
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['attachments', entityType, entityId],
    queryFn: () => api.get('/attachments', { params: { entityType, entityId } }).then((r) => r.data as any[]),
  });
  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', entityType);
    fd.append('entityId', entityId);
    if (desc) fd.append('description', desc);
    try {
      await api.post('/attachments', fd);
      message.success('Файл загружен');
      setDesc('');
      refetch();
    } catch (e) {
      message.error(errorText(e));
    }
    return false;
  };
  return (
    <>
      {can('attachments.upload') && (
        <div className="filters">
          <Input placeholder="Описание файла (необязательно)" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ width: 320 }} />
          <Upload beforeUpload={upload} showUploadList={false} accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.txt">
            <Button icon={<UploadOutlined />}>Прикрепить файл</Button>
          </Upload>
          <span className="muted">PDF, PNG, JPG, DOCX, XLSX, CSV, TXT</span>
        </div>
      )}
      <Table size="small" rowKey="id" loading={isFetching} dataSource={data} pagination={false} locale={{ emptyText: 'Файлов нет' }}
        columns={[
          { title: 'Файл', dataIndex: 'originalName' },
          { title: 'Описание', dataIndex: 'description' },
          { title: 'Размер', dataIndex: 'size', render: (v) => `${Math.ceil(v / 1024)} КБ`, width: 100 },
          { title: 'Загружен', dataIndex: 'createdAt', render: fmtDateTime, width: 150 },
          {
            title: '', width: 160, render: (_, r) => (
              <>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => download(`/attachments/${r.id}/download`, {}, r.originalName).catch((e) => message.error(errorText(e)))} />
                {(r.uploadedById === me?.id || can('settings.manage')) && (
                  <Popconfirm title="Переместить файл в архив?" onConfirm={() => api.delete(`/attachments/${r.id}`).then(() => refetch()).catch((e) => message.error(errorText(e)))}>
                    <Button size="small" type="link" danger>В архив</Button>
                  </Popconfirm>
                )}
              </>
            ),
          },
        ]} />
    </>
  );
}
