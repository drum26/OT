import { Alert, App, Button, Card, Checkbox, Result, Space, Statistic, Steps, Table, Tag, Upload, Row, Col } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorText } from '../../api/client';
import { PageHeader } from '../../components/Common';
import { download } from '../../utils/files';
import { fmtDate, fmtDateTime, EMPLOYEE_STATUS, FIELD_NAMES } from '../../utils/format';

const JOB_STATUS: Record<string, { t: string; c: string }> = { PREVIEW: { t: 'Предпросмотр', c: 'blue' }, COMPLETED: { t: 'Выполнен', c: 'green' }, FAILED: { t: 'Ошибка', c: 'red' }, CANCELLED: { t: 'Отменён', c: 'default' } };

export function ImportPage() {
  const { message, modal } = App.useApp();
  const nav = useNavigate();
  const [opts, setOpts] = useState({ updateExisting: true, createMissingUnits: false, createMissingPositions: false });
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const jobs = useQuery({ queryKey: ['import-jobs'], queryFn: () => api.get('/employees/import/jobs').then((r) => r.data as any[]) });

  const upload = async (file: File) => {
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(opts).forEach(([k, v]) => fd.append(k, String(v)));
    try {
      setPreview((await api.post('/employees/import/preview', fd)).data);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
    return false;
  };

  const commit = () => modal.confirm({
    title: 'Загрузить данные?',
    content: `Будет создано: ${preview.toCreate}, обновлено: ${preview.toUpdate}. Строки с ошибками (${preview.errorRows}) загружены не будут. Импорт выполняется в одной транзакции.`,
    okText: 'Загрузить',
    onOk: async () => {
      try {
        setResult((await api.post(`/employees/import/${preview.jobId}/commit`)).data);
        setPreview(null);
        jobs.refetch();
      } catch (e) {
        message.error(errorText(e));
      }
    },
  });

  const step = result ? 2 : preview ? 1 : 0;
  return (
    <>
      <PageHeader title="Импорт сотрудников из Excel" extra={<Button icon={<DownloadOutlined />} onClick={() => download('/employees/import/template', {}, 'Шаблон.xlsx')}>Скачать шаблон</Button>} />
      <Steps current={step} style={{ marginBottom: 16 }} items={[{ title: 'Выбор файла' }, { title: 'Проверка данных' }, { title: 'Результат' }]} />
      {step === 0 && (
        <Card>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Checkbox checked={opts.updateExisting} onChange={(e) => setOpts({ ...opts, updateExisting: e.target.checked })}>Обновлять существующих сотрудников (поиск по табельному номеру, без создания дубликатов)</Checkbox>
            <Checkbox checked={opts.createMissingUnits} onChange={(e) => setOpts({ ...opts, createMissingUnits: e.target.checked })}>Создавать отсутствующие подразделения</Checkbox>
            <Checkbox checked={opts.createMissingPositions} onChange={(e) => setOpts({ ...opts, createMissingPositions: e.target.checked })}>Создавать отсутствующие должности</Checkbox>
            <Upload.Dragger beforeUpload={upload} showUploadList={false} accept=".xlsx,.csv" disabled={busy}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p>{busy ? 'Проверка файла…' : 'Перетащите файл .xlsx или .csv или нажмите для выбора'}</p>
              <p className="muted">Обязательные столбцы: Табельный номер, Фамилия, Имя, Подразделение, Должность, Дата приёма</p>
            </Upload.Dragger>
          </Space>
        </Card>
      )}
      {step === 1 && (
        <Card>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}><Statistic title="Строк в файле" value={preview.totalRows} /></Col>
            <Col span={4}><Statistic title="Будет создано" value={preview.toCreate} valueStyle={{ color: '#1f6f43' }} /></Col>
            <Col span={4}><Statistic title="Будет обновлено" value={preview.toUpdate} /></Col>
            <Col span={4}><Statistic title="Без изменений" value={preview.unchanged} /></Col>
            <Col span={4}><Statistic title="Строк с ошибками" value={preview.errorRows} valueStyle={{ color: preview.errorRows ? '#cf1322' : undefined }} /></Col>
          </Row>
          {(preview.newUnits.length > 0 || preview.newPositions.length > 0) && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Будут созданы новые записи справочников"
              description={<>{preview.newUnits.length > 0 && <div>Подразделения: {preview.newUnits.join(', ')}</div>}{preview.newPositions.length > 0 && <div>Должности: {preview.newPositions.join(', ')}</div>}</>} />
          )}
          {preview.errors.length > 0 && (
            <Card size="small" title="Ошибки (строки не будут загружены)" style={{ marginBottom: 12 }}>
              <Table size="small" rowKey={(r: any, i) => `${r.rowNumber}-${i}`} dataSource={preview.errors} pagination={{ pageSize: 10 }}
                columns={[{ title: 'Строка', dataIndex: 'rowNumber', width: 80 }, { title: 'Поле', dataIndex: 'field', width: 200 }, { title: 'Значение', dataIndex: 'value', width: 200 }, { title: 'Ошибка', dataIndex: 'message' }]} />
            </Card>
          )}
          <Card size="small" title="Предварительный просмотр">
            <Table size="small" rowKey="rowNumber" dataSource={preview.preview} pagination={{ pageSize: 10 }} scroll={{ x: 1000 }}
              columns={[
                { title: 'Строка', dataIndex: 'rowNumber', width: 70 },
                { title: 'Действие', dataIndex: 'action', width: 120, render: (v) => <Tag color={v === 'create' ? 'green' : v === 'update' ? 'blue' : 'default'}>{v === 'create' ? 'Создание' : v === 'update' ? 'Обновление' : 'Без изменений'}</Tag> },
                { title: 'Таб. №', dataIndex: 'personnelNumber' },
                { title: 'ФИО', render: (_, r: any) => [r.lastName, r.firstName, r.middleName].filter(Boolean).join(' ') },
                { title: 'Подразделение', dataIndex: 'unitName' },
                { title: 'Должность', dataIndex: 'positionName' },
                { title: 'Дата приёма', render: (_, r: any) => fmtDate(r.hireDate) },
                { title: 'Статус', render: (_, r: any) => EMPLOYEE_STATUS[r.status]?.text },
                { title: 'Изменения', render: (_, r: any) => r.changes && Object.keys(r.changes).map((k) => FIELD_NAMES[k] ?? k).join(', ') },
              ]} />
          </Card>
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" onClick={commit} disabled={!preview.toCreate && !preview.toUpdate}>Загрузить корректные строки</Button>
            <Button onClick={() => { api.post(`/employees/import/${preview.jobId}/cancel`).catch(() => null); setPreview(null); }}>Отмена</Button>
          </Space>
        </Card>
      )}
      {step === 2 && (
        <Result status="success" title="Импорт выполнен"
          subTitle={`Создано: ${result.createdCount}, обновлено: ${result.updatedCount}, без изменений: ${result.skippedCount}, ошибок в файле: ${result.errorCount}`}
          extra={[<Button key="1" type="primary" onClick={() => nav('/employees')}>К списку сотрудников</Button>, <Button key="2" onClick={() => setResult(null)}>Загрузить ещё файл</Button>]} />
      )}
      <Card size="small" title="Журнал импорта" style={{ marginTop: 16 }}>
        <Table size="small" rowKey="id" dataSource={jobs.data} loading={jobs.isFetching} pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Дата', render: (_, r) => fmtDateTime(r.createdAt) },
            { title: 'Тип', dataIndex: 'importType', render: (v) => ({ EMPLOYEES: 'Сотрудники', PPE_ITEMS: 'Справочник СИЗ', PPE_STANDARDS: 'Нормы СИЗ' } as any)[v] },
            { title: 'Файл', dataIndex: 'fileName' },
            { title: 'Статус', dataIndex: 'status', render: (v) => <Tag color={JOB_STATUS[v]?.c}>{JOB_STATUS[v]?.t}</Tag> },
            { title: 'Строк', dataIndex: 'totalRows' }, { title: 'Создано', dataIndex: 'createdCount' }, { title: 'Обновлено', dataIndex: 'updatedCount' }, { title: 'Ошибок', dataIndex: 'errorCount' },
            { title: 'Сообщение', dataIndex: 'message', ellipsis: true },
          ]} />
      </Card>
    </>
  );
}
