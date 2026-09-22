import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  type FormInstance,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  feedbackClientLabels,
  feedbackStatusLabels,
  feedbackTypeLabels,
  type FeedbackDetail,
  type FeedbackListItem,
  type FeedbackStatus,
  type FeedbackType,
} from './feedback-types';
import {
  useAdminFeedbackDetail,
  useAdminFeedbackList,
  useUpdateFeedback,
} from './feedback-queries';

const cardStyle = {
  border: '1px solid #e5ebf4',
  boxShadow: '0 8px 24px rgba(34, 68, 116, 0.045)',
  background: '#ffffff',
};

const statusColors: Record<FeedbackStatus, string> = {
  PENDING: 'warning',
  IN_PROGRESS: 'processing',
  RESOLVED: 'success',
  CLOSED: 'default',
};

const statusOptions = Object.entries(feedbackStatusLabels).map(([value, label]) => ({
  value,
  label,
}));
const typeOptions = Object.entries(feedbackTypeLabels).map(([value, label]) => ({ value, label }));

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace('T', ' ').slice(0, 19);
}

function FeedbackStatusTag({ status }: { status: FeedbackStatus }) {
  return (
    <Tag color={statusColors[status]} style={{ borderRadius: 999, paddingInline: 9 }}>
      {feedbackStatusLabels[status]}
    </Tag>
  );
}

export function FeedbackCenterPage() {
  const [status, setStatus] = useState<FeedbackStatus | undefined>();
  const [type, setType] = useState<FeedbackType | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const query = useMemo(() => ({ status, type, page, pageSize }), [status, type, page, pageSize]);
  const feedbackList = useAdminFeedbackList(query);
  const rows = feedbackList.data?.data ?? [];

  const handleFilterChange = (
    nextStatus: FeedbackStatus | undefined,
    nextType: FeedbackType | undefined,
  ) => {
    setStatus(nextStatus);
    setType(nextType);
    setPage(1);
  };

  const columns: ColumnsType<FeedbackListItem> = [
    {
      title: '反馈编号',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Typography.Text strong>{code}</Typography.Text>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (value: FeedbackType) => feedbackTypeLabels[value],
    },
    {
      title: '来源端',
      dataIndex: 'clientType',
      key: 'clientType',
      render: (value: FeedbackListItem['clientType']) => feedbackClientLabels[value],
    },
    {
      title: '班级',
      dataIndex: ['classroom', 'name'],
      key: 'classroom',
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: FeedbackStatus) => <FeedbackStatusTag status={value} />,
    },
    {
      title: '版本',
      dataIndex: 'appVersion',
      key: 'appVersion',
      render: (value: string | null) => value || '—',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedFeedbackId(record.id)}>
          查看详情
        </Button>
      ),
    },
  ];

  const pagination: TablePaginationConfig = {
    current: feedbackList.data?.meta.page ?? page,
    pageSize: feedbackList.data?.meta.pageSize ?? pageSize,
    total: feedbackList.data?.meta.total ?? 0,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 条`,
  };

  return (
    <div>
      <AdminPageHeader
        title="反馈中心"
        action={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void feedbackList.refetch()}
            loading={feedbackList.isFetching}
          >
            刷新
          </Button>
        }
      />

      <Card style={cardStyle} styles={{ body: { padding: 18 } }}>
        <Space wrap size={[12, 12]} style={{ display: 'flex', marginBottom: 18 }}>
          <Select
            allowClear
            value={status}
            placeholder="全部状态"
            options={statusOptions}
            style={{ width: 150 }}
            onChange={(value: FeedbackStatus | undefined) => handleFilterChange(value, type)}
          />
          <Select
            allowClear
            value={type}
            placeholder="全部类型"
            options={typeOptions}
            style={{ width: 150 }}
            onChange={(value: FeedbackType | undefined) => handleFilterChange(status, value)}
          />
        </Space>

        {feedbackList.isError ? (
          <Alert
            type="error"
            showIcon
            title="反馈列表加载失败"
            description={
              feedbackList.error instanceof Error ? feedbackList.error.message : '请稍后重试'
            }
            action={<Button onClick={() => void feedbackList.refetch()}>重试</Button>}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Table<FeedbackListItem>
          rowKey="id"
          loading={feedbackList.isLoading}
          columns={columns}
          dataSource={rows}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无反馈" />,
          }}
          pagination={pagination}
          onChange={(nextPagination) => {
            setPage(nextPagination.current ?? 1);
            setPageSize(nextPagination.pageSize ?? 20);
          }}
          scroll={{ x: 920 }}
        />
      </Card>

      <FeedbackDetailDrawer
        feedbackId={selectedFeedbackId}
        open={Boolean(selectedFeedbackId)}
        onClose={() => setSelectedFeedbackId(null)}
      />
    </div>
  );
}

function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 20,
        marginBottom: 22,
      }}
    >
      <div>
        {eyebrow ? (
          <Typography.Text
            style={{ color: '#0a59f7', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}
          >
            {eyebrow.toUpperCase()}
          </Typography.Text>
        ) : null}
        <Typography.Title level={2} style={{ margin: '5px 0', color: '#172b4d', fontSize: 27 }}>
          {title}
        </Typography.Title>
        {description ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {description}
          </Typography.Text>
        ) : null}
      </div>
      {action}
    </div>
  );
}

interface FeedbackDetailDrawerProps {
  feedbackId: string | null;
  open: boolean;
  onClose: () => void;
}

interface FeedbackDetailFormValues {
  status: FeedbackStatus;
  processingNote?: string;
}

function FeedbackDetailDrawer({ feedbackId, open, onClose }: FeedbackDetailDrawerProps) {
  const { modal, notification } = AntApp.useApp();
  const [form] = Form.useForm<FeedbackDetailFormValues>();
  const detailQuery = useAdminFeedbackDetail(feedbackId);
  const updateFeedback = useUpdateFeedback();
  const detail = detailQuery.data;

  useEffect(() => {
    if (!detail) return;
    form.setFieldsValue({
      status: detail.status,
      processingNote: detail.processingNote ?? undefined,
    });
  }, [detail, form]);

  const save = (values: FeedbackDetailFormValues) => {
    if (!feedbackId) return;
    modal.confirm({
      title: values.status === 'CLOSED' ? '确认关闭反馈？' : '确认更新反馈？',
      content: '状态和处理备注会立即保存。',
      okText: '确认保存',
      cancelText: '取消',
      onOk: async () => {
        try {
          await updateFeedback.mutateAsync({
            feedbackId,
            input: {
              status: values.status,
              processingNote: values.processingNote?.trim() || null,
            },
          });
          notification.success({ title: '反馈已更新' });
          onClose();
        } catch {
          notification.error({ title: '反馈更新失败', description: '请稍后重试' });
        }
      },
    });
  };

  return (
    <Drawer
      title={detail ? `反馈详情 · ${detail.code}` : '反馈详情'}
      open={open}
      onClose={onClose}
      size={560}
      destroyOnHidden
      loading={detailQuery.isLoading}
    >
      {detailQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title="详情加载失败"
          description={
            detailQuery.error instanceof Error ? detailQuery.error.message : '请稍后重试'
          }
          action={<Button onClick={() => void detailQuery.refetch()}>重试</Button>}
        />
      ) : null}
      {detail ? (
        <FeedbackDetailContent
          detail={detail}
          form={form}
          onFinish={save}
          saving={updateFeedback.isPending}
        />
      ) : null}
    </Drawer>
  );
}

function FeedbackDetailContent({
  detail,
  form,
  onFinish,
  saving,
}: {
  detail: FeedbackDetail;
  form: FormInstance<FeedbackDetailFormValues>;
  onFinish: (values: FeedbackDetailFormValues) => void;
  saving: boolean;
}) {
  return (
    <Space orientation="vertical" size={20} style={{ display: 'flex' }}>
      <section>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          用户提交内容
        </Typography.Title>
        <Typography.Paragraph
          style={{ whiteSpace: 'pre-wrap', marginBottom: detail.screenshotUrl ? 14 : 0 }}
        >
          {detail.description}
        </Typography.Paragraph>
        {detail.screenshotUrl ? (
          <a href={detail.screenshotUrl} target="_blank" rel="noreferrer">
            <img
              src={detail.screenshotUrl}
              alt="反馈截图"
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: 300,
                borderRadius: 8,
                border: '1px solid #e5ebf4',
              }}
            />
          </a>
        ) : null}
      </section>

      <section>
        <Typography.Title level={5}>系统上下文</Typography.Title>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="反馈类型">{feedbackTypeLabels[detail.type]}</Descriptions.Item>
          <Descriptions.Item label="来源端">
            {feedbackClientLabels[detail.clientType]}
          </Descriptions.Item>
          <Descriptions.Item label="班级">{detail.classroom.name}</Descriptions.Item>
          <Descriptions.Item label="提交人">{detail.submittedBy.name}</Descriptions.Item>
          <Descriptions.Item label="模块">{detail.module || '—'}</Descriptions.Item>
          <Descriptions.Item label="页面">{detail.page || '—'}</Descriptions.Item>
          <Descriptions.Item label="应用版本">{detail.appVersion || '—'}</Descriptions.Item>
          <Descriptions.Item label="浏览器">{detail.browser || '—'}</Descriptions.Item>
          <Descriptions.Item label="Trace ID">{detail.traceId}</Descriptions.Item>
          <Descriptions.Item label="提交时间">{formatDateTime(detail.createdAt)}</Descriptions.Item>
        </Descriptions>
      </section>

      <section>
        <Typography.Title level={5}>处理信息</Typography.Title>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="status"
            label="当前状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="processingNote" label="处理备注">
            <Input.TextArea
              rows={4}
              maxLength={2000}
              showCount
              placeholder="记录处理结果或后续安排"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存处理信息
          </Button>
        </Form>
        {detail.processedAt ? (
          <Typography.Text
            type="secondary"
            style={{ display: 'block', marginTop: 10, fontSize: 12 }}
          >
            {detail.processedBy?.name || '班主任'} · {formatDateTime(detail.processedAt)}
          </Typography.Text>
        ) : null}
      </section>
    </Space>
  );
}
