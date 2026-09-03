'use client';

import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';

import { useAdminSchedule, useAdminTeachers, type ScheduleDraft } from '../admin-queries';
import { parseScheduleFile } from './schedule-import-api';
import type { SchedulePeriod, Weekday } from '@/lib';

const WEEKDAYS: Array<{ value: Weekday; label: string }> = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];

const DEFAULT_PERIODS: SchedulePeriod[] = [
  { periodNo: 1, startTime: '08:00', endTime: '08:40' },
  { periodNo: 2, startTime: '08:50', endTime: '09:30' },
  { periodNo: 3, startTime: '09:50', endTime: '10:30' },
  { periodNo: 4, startTime: '10:40', endTime: '11:20' },
  { periodNo: 5, startTime: '14:00', endTime: '14:40' },
  { periodNo: 6, startTime: '14:50', endTime: '15:30' },
  { periodNo: 7, startTime: '15:50', endTime: '16:30' },
  { periodNo: 8, startTime: '16:40', endTime: '17:20' },
];

const cardStyle = { border: '1px solid #e5ebf4', boxShadow: '0 8px 24px rgba(34, 68, 116, 0.045)' };

function shiftTime(value: string, minutes: number): string {
  const [hour, minute] = value.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, hour * 60 + minute + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function extendPeriods(periods: SchedulePeriod[], periodCount: number): SchedulePeriod[] {
  const nextPeriods = periods.map((period) => ({ ...period }));
  while (nextPeriods.length < periodCount) {
    const last = nextPeriods.at(-1);
    const startTime = last ? shiftTime(last.endTime, 10) : '08:00';
    const endTime = shiftTime(startTime, 40);
    nextPeriods.push({
      periodNo: nextPeriods.length + 1,
      startTime,
      endTime,
    });
  }
  return nextPeriods;
}

function templatesForImport(
  templates: ScheduleDraft['templates'],
  periodCount: number,
): ScheduleDraft['templates'] {
  if (templates.length === 0) {
    return [
      {
        clientKey: 'import-' + Date.now(),
        name: '标准作息',
        periods: extendPeriods(DEFAULT_PERIODS, periodCount),
      },
    ];
  }
  return templates.map((template) => ({
    ...template,
    periods: extendPeriods(template.periods, periodCount),
  }));
}

export function SchedulePage() {
  const { message } = AntApp.useApp();
  const {
    activeTemplateKey,
    templates,
    entries,
    isDirty,
    isLoading,
    isSaving,
    updateDraft,
    saveSchedule,
  } = useAdminSchedule();
  const { teachers } = useAdminTeachers();
  const [editingCell, setEditingCell] = useState<{ weekday: Weekday; periodNo: number } | null>(
    null,
  );
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(activeTemplateKey);
  const [cellForm] = Form.useForm<{ courseName: string; classTeacherId?: string }>();

  const activeTemplate =
    templates.find((template) => template.clientKey === activeTemplateKey) ?? templates[0];
  const teacherOptions = teachers
    .filter((teacher) => teacher.status === 'ACTIVE')
    .map((teacher) => ({ value: teacher.id, label: teacher.name }));
  const entryMap = useMemo(
    () => new Map(entries.map((entry) => [`${entry.weekday}-${entry.periodNo}`, entry])),
    [entries],
  );

  useEffect(() => {
    if (!editingCell) return;
    const entry = entryMap.get(`${editingCell.weekday}-${editingCell.periodNo}`);
    cellForm.setFieldsValue({
      courseName: entry?.courseName ?? '',
      classTeacherId: entry?.classTeacherId ?? undefined,
    });
  }, [cellForm, editingCell, entryMap]);

  const update = (next: Partial<ScheduleDraft>) => {
    updateDraft({ activeTemplateKey, templates, entries, ...next });
  };

  const handleScheduleImport = async (file: File) => {
    setIsImporting(true);
    try {
      const result = await parseScheduleFile(file);
      const nextTemplates = templatesForImport(templates, result.maxPeriodNo);
      const nextActiveTemplateKey = activeTemplateKey || nextTemplates[0].clientKey;
      update({
        activeTemplateKey: nextActiveTemplateKey,
        templates: nextTemplates,
        entries: result.entries.map((entry) => ({
          ...entry,
          classTeacherId: entry.classTeacherId ?? null,
          teacher: null,
        })),
      });
      setImportModalOpen(false);
      message.success('已导入 ' + result.entries.length + ' 个课程');
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '课表导入失败');
    } finally {
      setIsImporting(false);
    }
  };

  const openCell = (weekday: Weekday, periodNo: number) => {
    setEditingCell({ weekday, periodNo });
  };

  const saveCell = async () => {
    if (!editingCell) return;
    const values = await cellForm.validateFields();
    const nextEntries = entries.filter(
      (entry) => entry.weekday !== editingCell.weekday || entry.periodNo !== editingCell.periodNo,
    );
    if (values.courseName.trim()) {
      const teacher = teachers.find((item) => item.id === values.classTeacherId);
      nextEntries.push({
        weekday: editingCell.weekday,
        periodNo: editingCell.periodNo,
        courseName: values.courseName.trim(),
        classTeacherId: values.classTeacherId ?? null,
        teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
      });
    }
    update({ entries: nextEntries });
    setEditingCell(null);
  };

  const clearCell = () => {
    if (!editingCell) return;
    update({
      entries: entries.filter(
        (entry) => entry.weekday !== editingCell.weekday || entry.periodNo !== editingCell.periodNo,
      ),
    });
    setEditingCell(null);
  };

  const openTemplateModal = () => {
    setSelectedTemplateKey(activeTemplateKey || templates[0]?.clientKey || '');
    setTemplateModalOpen(true);
  };

  const updateTemplate = (
    clientKey: string,
    changes: { name?: string; periods?: SchedulePeriod[] },
  ) => {
    update({
      templates: templates.map((template) =>
        template.clientKey === clientKey ? { ...template, ...changes } : template,
      ),
    });
  };

  const createTemplate = () => {
    const clientKey = `new-${Date.now()}`;
    const periods = (activeTemplate?.periods ?? DEFAULT_PERIODS).map((period) => ({ ...period }));
    const next = { clientKey, name: '新作息', periods };
    update({ templates: [...templates, next], activeTemplateKey: activeTemplateKey || clientKey });
    setSelectedTemplateKey(clientKey);
  };

  const deleteTemplate = (clientKey: string) => {
    if (templates.length <= 1) return;
    const nextTemplates = templates.filter((template) => template.clientKey !== clientKey);
    const nextActiveKey =
      activeTemplateKey === clientKey ? nextTemplates[0].clientKey : activeTemplateKey;
    update({ templates: nextTemplates, activeTemplateKey: nextActiveKey });
    if (selectedTemplateKey === clientKey) setSelectedTemplateKey(nextTemplates[0].clientKey);
  };

  const updateSelectedPeriod = (
    periodNo: number,
    field: 'startTime' | 'endTime',
    value: string,
  ) => {
    const template = templates.find((item) => item.clientKey === selectedTemplateKey);
    if (!template) return;
    updateTemplate(selectedTemplateKey, {
      periods: template.periods.map((period) =>
        period.periodNo === periodNo ? { ...period, [field]: value } : period,
      ),
    });
  };

  const addPeriod = () => {
    if (!templates[0] || templates[0].periods.length >= 12) return;
    const last = templates[0].periods.at(-1);
    const nextPeriodNo = (last?.periodNo ?? 0) + 1;
    const startTime = last ? shiftTime(last.endTime, 10) : '08:00';
    const endTime = shiftTime(startTime, 40);
    update({
      templates: templates.map((template) => ({
        ...template,
        periods: [...template.periods, { periodNo: nextPeriodNo, startTime, endTime }],
      })),
    });
  };

  const removePeriod = () => {
    if (!templates[0] || templates[0].periods.length <= 1) return;
    const periodNo = templates[0].periods.at(-1)!.periodNo;
    update({
      templates: templates.map((template) => ({
        ...template,
        periods: template.periods.filter((period) => period.periodNo !== periodNo),
      })),
      entries: entries.filter((entry) => entry.periodNo !== periodNo),
    });
  };

  const columns: ColumnsType<SchedulePeriod> = [
    {
      title: '节次',
      dataIndex: 'periodNo',
      key: 'periodNo',
      width: 76,
      fixed: 'left',
      render: (periodNo: number) => <Typography.Text strong>第{periodNo}节</Typography.Text>,
    },
    {
      title: '时间',
      key: 'time',
      width: 116,
      fixed: 'left',
      render: (_value, period) => (
        <Typography.Text type="secondary">
          {period.startTime}—{period.endTime}
        </Typography.Text>
      ),
    },
    ...WEEKDAYS.map((weekday) => ({
      title: weekday.label,
      key: weekday.value,
      width: 138,
      render: (_value: unknown, period: SchedulePeriod) => {
        const entry = entryMap.get(`${weekday.value}-${period.periodNo}`);
        return (
          <Button
            type="text"
            block
            onClick={() => openCell(weekday.value, period.periodNo)}
            style={{ minHeight: 58, height: 'auto', padding: '7px 6px', textAlign: 'left' }}
          >
            {entry ? (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Typography.Text strong>{entry.courseName}</Typography.Text>
                {entry.teacher ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {entry.teacher.name}
                  </Typography.Text>
                ) : null}
              </span>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            )}
          </Button>
        );
      },
    })),
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 22,
        }}
      >
        <Typography.Title level={2} style={{ margin: 0, color: '#172b4d', fontSize: 27 }}>
          课程表
        </Typography.Title>
        <Space wrap>
          {isDirty ? <Tag color="orange">未保存</Tag> : null}
          <Select
            value={activeTemplateKey || undefined}
            placeholder="作息模板"
            options={templates.map((template) => ({
              value: template.clientKey,
              label: template.name,
            }))}
            onChange={(value) => update({ activeTemplateKey: value })}
            style={{ width: 150 }}
          />
          <Button icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>
            导入课表
          </Button>
          <Button icon={<EditOutlined />} onClick={openTemplateModal}>
            作息模板
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={!isDirty}
            loading={isSaving}
            onClick={() => void saveSchedule().then(() => message.success('已保存'))}
          >
            保存
          </Button>
        </Space>
      </div>
      <Card style={cardStyle} styles={{ body: { padding: 0 } }}>
        {activeTemplate ? (
          <Table<SchedulePeriod>
            rowKey="periodNo"
            loading={isLoading}
            columns={columns}
            dataSource={activeTemplate.periods}
            pagination={false}
            scroll={{ x: 1160 }}
          />
        ) : (
          <Empty description="暂无课表">
            <Button type="primary" icon={<PlusOutlined />} onClick={openTemplateModal}>
              新建作息模板
            </Button>
          </Empty>
        )}
      </Card>

      <Modal
        title="导入课表"
        open={importModalOpen}
        onCancel={() => {
          if (!isImporting) setImportModalOpen(false);
        }}
        footer={null}
        destroyOnHidden
      >
        <Upload.Dragger
          accept=".xlsx,.xls,.csv"
          multiple={false}
          maxCount={1}
          showUploadList={false}
          disabled={isImporting}
          beforeUpload={(file) => {
            void handleScheduleImport(file);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />} loading={isImporting}>
            选择课表文件
          </Button>
        </Upload.Dragger>
      </Modal>

      <Modal
        title="编辑课程"
        open={editingCell !== null}
        onCancel={() => setEditingCell(null)}
        onOk={() => void saveCell()}
        okText="确定"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={cellForm} layout="vertical">
          <Form.Item
            name="courseName"
            label="课程名称"
            rules={[{ required: true, whitespace: true, message: '请输入课程名称' }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="classTeacherId" label="任课教师">
            <Select allowClear options={teacherOptions} />
          </Form.Item>
        </Form>
        <Button danger type="link" onClick={clearCell} style={{ padding: 0 }}>
          清空课程
        </Button>
      </Modal>

      <Modal
        title="作息模板"
        open={templateModalOpen}
        onCancel={() => setTemplateModalOpen(false)}
        footer={
          <Button type="primary" onClick={() => setTemplateModalOpen(false)}>
            完成
          </Button>
        }
        width={760}
        destroyOnHidden
      >
        <Flex vertical gap={16} style={{ width: '100%' }}>
          <Space wrap>
            <Button icon={<PlusOutlined />} onClick={createTemplate}>
              新建模板
            </Button>
            <Button
              onClick={addPeriod}
              disabled={!templates.length || templates[0].periods.length >= 12}
            >
              新增节次
            </Button>
            <Button
              danger
              onClick={removePeriod}
              disabled={!templates.length || templates[0].periods.length <= 1}
            >
              删除末节
            </Button>
          </Space>
          <Table
            rowKey="clientKey"
            size="small"
            pagination={false}
            dataSource={templates}
            columns={
              [
                {
                  title: '模板名称',
                  dataIndex: 'name',
                  render: (_value: string, template: ScheduleDraft['templates'][number]) => (
                    <Input
                      value={template.name}
                      onChange={(event) =>
                        updateTemplate(template.clientKey, { name: event.target.value })
                      }
                    />
                  ),
                },
                {
                  title: '当前',
                  width: 90,
                  render: (_value: unknown, template: ScheduleDraft['templates'][number]) => (
                    <Button
                      type={activeTemplateKey === template.clientKey ? 'primary' : 'default'}
                      size="small"
                      onClick={() => update({ activeTemplateKey: template.clientKey })}
                    >
                      使用
                    </Button>
                  ),
                },
                {
                  title: '操作',
                  width: 80,
                  render: (_value: unknown, template: ScheduleDraft['templates'][number]) => (
                    <Popconfirm
                      title="删除模板？"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => deleteTemplate(template.clientKey)}
                    >
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={templates.length <= 1}
                      />
                    </Popconfirm>
                  ),
                },
              ] as ColumnsType<ScheduleDraft['templates'][number]>
            }
          />
          {templates.find((template) => template.clientKey === selectedTemplateKey) ? (
            <Table<SchedulePeriod>
              rowKey="periodNo"
              size="small"
              pagination={false}
              dataSource={
                templates.find((template) => template.clientKey === selectedTemplateKey)!.periods
              }
              columns={
                [
                  {
                    title: '节次',
                    dataIndex: 'periodNo',
                    width: 90,
                    render: (periodNo: number) => `第${periodNo}节`,
                  },
                  {
                    title: '上课',
                    render: (_value: unknown, period: SchedulePeriod) => (
                      <Input
                        value={period.startTime}
                        onChange={(event) =>
                          updateSelectedPeriod(period.periodNo, 'startTime', event.target.value)
                        }
                      />
                    ),
                  },
                  {
                    title: '下课',
                    render: (_value: unknown, period: SchedulePeriod) => (
                      <Input
                        value={period.endTime}
                        onChange={(event) =>
                          updateSelectedPeriod(period.periodNo, 'endTime', event.target.value)
                        }
                      />
                    ),
                  },
                ] as ColumnsType<SchedulePeriod>
              }
            />
          ) : null}
          <Select
            value={selectedTemplateKey || undefined}
            options={templates.map((template) => ({
              value: template.clientKey,
              label: template.name,
            }))}
            onChange={setSelectedTemplateKey}
            placeholder="编辑模板"
            style={{ width: 180 }}
          />
        </Flex>
      </Modal>
    </div>
  );
}
