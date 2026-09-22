import { CheckCircleOutlined, MessageOutlined } from '@ant-design/icons';
import {
  App as AntApp,
  Button,
  Drawer,
  Form,
  Input,
  Result,
  Select,
  Space,
  Typography,
} from 'antd';
import { useState } from 'react';
import { createTraceId } from '@/lib';
import { useCreateFeedback } from './feedback-queries';
import {
  feedbackTypeLabels,
  type CreateFeedbackInput,
  type CreateFeedbackResult,
  type FeedbackType,
} from './feedback-types';

const appVersion = import.meta.env.VITE_APP_VERSION || 'web';

interface FeedbackFormValues {
  type: FeedbackType;
  description: string;
}

interface FeedbackSubmitDrawerProps {
  open: boolean;
  onClose: () => void;
  module: string;
  page: string;
}

export function FeedbackSubmitDrawer({ open, onClose, module, page }: FeedbackSubmitDrawerProps) {
  const [form] = Form.useForm<FeedbackFormValues>();
  const [submitted, setSubmitted] = useState<CreateFeedbackResult | null>(null);
  const { notification } = AntApp.useApp();
  const createFeedback = useCreateFeedback();

  const handleClose = () => {
    form.resetFields();
    setSubmitted(null);
    createFeedback.reset();
    onClose();
  };

  const handleFinish = async (values: FeedbackFormValues) => {
    const input: CreateFeedbackInput = {
      ...values,
      clientType: 'ADMIN_WEB',
      module,
      page,
      appVersion,
      browser: typeof navigator === 'undefined' ? undefined : navigator.userAgent.slice(0, 255),
      traceId: createTraceId(),
    };
    try {
      const result = await createFeedback.mutateAsync(input);
      setSubmitted(result);
      notification.success({ title: '反馈已收到', description: `反馈编号：${result.code}` });
    } catch {
      // The shared backend alert and form-level mutation state provide the error context.
    }
  };

  return (
    <Drawer
      title={
        <Space>
          <MessageOutlined />
          <span>提交反馈</span>
        </Space>
      }
      open={open}
      onClose={handleClose}
      size={460}
      destroyOnHidden
      footer={
        submitted ? (
          <Button block type="primary" onClick={handleClose}>
            完成
          </Button>
        ) : (
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleClose}>取消</Button>
            <Button type="primary" loading={createFeedback.isPending} onClick={() => form.submit()}>
              提交反馈
            </Button>
          </Space>
        )
      }
    >
      {submitted ? (
        <Result
          icon={<CheckCircleOutlined style={{ color: '#12a46b' }} />}
          status="success"
          title="反馈已收到"
          subTitle={`编号 ${submitted.code} · Trace ID ${submitted.traceId}`}
        />
      ) : (
        <>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 18 }}>
            当前页面和运行环境会自动附在反馈中。
          </Typography.Text>
          <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark="optional">
            <Form.Item
              name="type"
              label="反馈类型"
              rules={[{ required: true, message: '请选择反馈类型' }]}
            >
              <Select
                placeholder="请选择"
                options={Object.entries(feedbackTypeLabels).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="description"
              label="问题描述"
              rules={[
                { required: true, message: '请填写问题描述' },
                { whitespace: true, message: '请填写问题描述' },
                { max: 5000, message: '问题描述不能超过 5000 字' },
              ]}
            >
              <Input.TextArea
                rows={8}
                showCount
                maxLength={5000}
                placeholder="请描述遇到的问题或建议"
              />
            </Form.Item>
          </Form>
          {createFeedback.isError ? (
            <Typography.Text type="danger" style={{ display: 'block', marginTop: 8 }}>
              {createFeedback.error instanceof Error
                ? createFeedback.error.message
                : '提交失败，请稍后重试'}
            </Typography.Text>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
