import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useUsageAnalytics } from '../feedback/feedback-queries';
import type { UsageAnalyticsSummary } from '../feedback/feedback-types';

const { RangePicker } = DatePicker;

const cardStyle = {
  border: '1px solid #e5ebf4',
  boxShadow: '0 8px 24px rgba(34, 68, 116, 0.045)',
  background: '#ffffff',
};

const featureLabels: Record<string, string> = {
  score: '积分操作',
  scores: '积分操作',
  ranking: '排行榜',
  'random-pick': '随机点名',
  random_pick: '随机点名',
  seating: '座位调整',
  students: '学生管理',
  teachers: '教师管理',
  score_rules: '积分规则',
  schedule: '课程表',
  classroom: '班级设置',
  feedback: '问题反馈',
  display_devices: '大屏设备',
};

function formatDateTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}

function formatDate(value: string): string {
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export function AnalyticsPage() {
  const [range, setRange] = useState<{ from?: string; to?: string }>();
  const analytics = useUsageAnalytics(range);
  const summary = analytics.data;

  return (
    <div>
      <AdminPageHeader
        title="使用状况分析"
        description={
          summary
            ? `${formatDateTime(summary.range.from)} 至 ${formatDateTime(summary.range.to)}`
            : undefined
        }
        action={
          <Space wrap>
            <RangePicker
              format="YYYY-MM-DD"
              allowClear
              onChange={(dates) => {
                const from = dates?.[0];
                const to = dates?.[1];
                setRange(
                  from && to
                    ? { from: from.startOf('day').toISOString(), to: to.endOf('day').toISOString() }
                    : undefined,
                );
              }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void analytics.refetch()}
              loading={analytics.isFetching}
            >
              刷新
            </Button>
          </Space>
        }
      />

      {analytics.isError ? (
        <Alert
          type="error"
          showIcon
          title="使用状况加载失败"
          description={analytics.error instanceof Error ? analytics.error.message : '请稍后重试'}
          action={<Button onClick={() => void analytics.refetch()}>重试</Button>}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Spin spinning={analytics.isLoading}>
        {summary ? (
          <AnalyticsContent summary={summary} />
        ) : (
          <Card style={cardStyle}>
            <Empty description="暂无分析数据" />
          </Card>
        )}
      </Spin>
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

function AnalyticsContent({ summary }: { summary: UsageAnalyticsSummary }) {
  const maxFeatureUsage = Math.max(...summary.featureUsage.map((item) => item.usageCount), 1);
  const featureColumns: ColumnsType<UsageAnalyticsSummary['featureUsage'][number]> = [
    {
      title: '功能',
      dataIndex: 'feature',
      key: 'feature',
      render: (value: string) => featureLabels[value] ?? value,
    },
    {
      title: '使用次数',
      dataIndex: 'usageCount',
      key: 'usageCount',
      sorter: (left, right) => left.usageCount - right.usageCount,
      render: (value: number) => (
        <Space size={10} style={{ minWidth: 180 }}>
          <Progress
            percent={Math.round((value / maxFeatureUsage) * 100)}
            showInfo={false}
            size="small"
            style={{ width: 90 }}
          />
          <Typography.Text strong>{value}</Typography.Text>
        </Space>
      ),
    },
    { title: '使用教师数', dataIndex: 'activeTeachers', key: 'activeTeachers' },
    { title: '使用班级数', dataIndex: 'activeClassrooms', key: 'activeClassrooms' },
  ];
  const trendColumns: ColumnsType<UsageAnalyticsSummary['displays']['dailyTrend'][number]> = [
    { title: '日期', dataIndex: 'date', key: 'date', render: formatDate },
    {
      title: '活跃大屏',
      dataIndex: 'activeDevices',
      key: 'activeDevices',
      render: (value: number) => `${value} 台`,
    },
    {
      title: '在线分钟',
      dataIndex: 'onlineMinutes',
      key: 'onlineMinutes',
      render: (value: number) => `${value} 分钟`,
    },
  ];
  const versionColumns: ColumnsType<UsageAnalyticsSummary['versions'][number]> = [
    { title: '版本', dataIndex: 'version', key: 'version' },
    {
      title: '活跃客户端',
      dataIndex: 'activeClients',
      key: 'activeClients',
      render: (value: number) => `${value} 个`,
    },
  ];

  return (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <AnalyticsMetric
            title="活跃班级"
            value={summary.activeClassrooms}
            suffix="个"
            color="#0a59f7"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <AnalyticsMetric
            title="活跃教师"
            value={summary.activeTeachers}
            suffix="位"
            color="#7a5af8"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <AnalyticsMetric
            title="当前在线大屏"
            value={summary.displays.currentlyOnline}
            suffix={`/ ${summary.displays.configured} 台`}
            color="#f08c2e"
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <AnalyticsMetric
            title="反馈数量"
            value={summary.feedback.total}
            suffix="条"
            color="#12a46b"
            detail={`待处理 ${summary.feedback.new}`}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}>
          <Card style={cardStyle} styles={{ body: { padding: 22 } }}>
            <SectionTitle title="反馈概览" />
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="新反馈" value={summary.feedback.new} />
              </Col>
              <Col span={8}>
                <Statistic title="待处理" value={summary.feedback.pending} />
              </Col>
              <Col span={8}>
                <Statistic title="已解决" value={summary.feedback.resolved} />
              </Col>
            </Row>
            <Typography.Text
              type="secondary"
              style={{ display: 'block', marginTop: 18, fontSize: 12 }}
            >
              已关闭 {summary.feedback.closed} 条
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card style={cardStyle} styles={{ body: { padding: 22 } }}>
            <SectionTitle title="大屏运行" />
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="已配置" value={summary.displays.configured} suffix="台" />
              </Col>
              <Col span={8}>
                <Statistic
                  title="平均在线"
                  value={summary.displays.averageOnlineMinutes}
                  suffix="分钟"
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="连接异常"
                  value={summary.displays.realtimeConnectionErrors}
                  suffix="次"
                />
              </Col>
            </Row>
            <Space style={{ marginTop: 18 }}>
              <Tag color={summary.errorCount ? 'warning' : 'success'}>
                异常事件 {summary.errorCount}
              </Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                有效事件 {summary.eventCount}
              </Typography.Text>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card style={{ ...cardStyle, marginTop: 16 }} styles={{ body: { padding: 22 } }}>
        <SectionTitle title="功能使用排行" description="按有效使用事件统计" />
        <Table
          rowKey="feature"
          columns={featureColumns}
          dataSource={summary.featureUsage}
          pagination={false}
          locale={{
            emptyText: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无功能使用数据" />
            ),
          }}
        />
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={14}>
          <Card style={cardStyle} styles={{ body: { padding: 22 } }}>
            <SectionTitle title="大屏在线趋势" />
            <Table
              rowKey="date"
              columns={trendColumns}
              dataSource={summary.displays.dailyTrend}
              pagination={false}
              locale={{
                emptyText: (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无大屏在线数据" />
                ),
              }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card style={cardStyle} styles={{ body: { padding: 22 } }}>
            <SectionTitle title="版本分布" />
            <Table
              rowKey="version"
              columns={versionColumns}
              dataSource={summary.versions}
              pagination={false}
              locale={{
                emptyText: (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无版本数据" />
                ),
              }}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Typography.Title level={4} style={{ margin: 0, color: '#203554' }}>
        {title}
      </Typography.Title>
      {description ? (
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          {description}
        </Typography.Text>
      ) : null}
    </div>
  );
}

function AnalyticsMetric({
  title,
  value,
  suffix,
  detail,
  color,
}: {
  title: string;
  value: number;
  suffix?: string;
  detail?: string;
  color: string;
}) {
  return (
    <Card
      style={{ ...cardStyle, height: '100%' }}
      styles={{ body: { padding: 19, minHeight: 140 } }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {title}
      </Typography.Text>
      <Statistic
        value={value}
        suffix={suffix}
        styles={{ content: { marginTop: 8, color: '#172b4d', fontSize: 28, fontWeight: 700 } }}
      />
      {detail ? (
        <Typography.Text style={{ display: 'block', marginTop: 8, color, fontSize: 12 }}>
          {detail}
        </Typography.Text>
      ) : null}
    </Card>
  );
}
