import { useRef, useState } from 'react';
import { App, Button, Modal, Popconfirm, Space, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useClassroomService } from '@/components/providers/classroom-system-provider';
import { getActiveClassId } from '@/lib/session';
import type { WechatTeacherInvitation } from '@/lib/domain';
import type { Teacher } from './admin-data';
import { adminQueryKeys } from './admin-queries';

export function WechatTeacherControls({ teacher }: { teacher: Teacher }) {
  const service = useClassroomService();
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const classId = getActiveClassId() ?? '';
  const [invitation, setInvitation] = useState<WechatTeacherInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const operationLock = useRef(false);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.teachers(classId) });
  const failure = (error: unknown) =>
    notification.error({
      title: '操作失败',
      description: error instanceof Error ? error.message : '请稍后重试',
    });

  const generate = async () => {
    if (operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    try {
      setInvitation(await service.createWechatTeacherInvitation(classId, teacher.id));
      await refresh();
    } catch (error) {
      failure(error);
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  };
  const revoke = async () => {
    if (operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    try {
      await service.revokeWechatTeacherInvitations(classId, teacher.id);
      setInvitation(null);
      await refresh();
      notification.success({ title: '小程序邀请已撤销' });
    } catch (error) {
      failure(error);
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  };

  return (
    <Space orientation="vertical" style={{ marginTop: 20, width: '100%' }}>
      <Typography.Text>微信：{teacher.wechatBound ? '已绑定' : '未绑定'}</Typography.Text>
      {teacher.wechatInvitationExpiresAt && (
        <Typography.Text type="secondary">
          邀请有效期至 {new Date(teacher.wechatInvitationExpiresAt).toLocaleString('zh-CN')}
        </Typography.Text>
      )}
      {teacher.status !== 'DISABLED' && (
        <Space wrap>
          <Button loading={busy} onClick={() => void generate()}>
            {teacher.wechatBound ? '生成小程序入口' : '生成小程序邀请'}
          </Button>
          <Popconfirm
            title="撤销未使用的小程序邀请？"
            okText="撤销"
            cancelText="取消"
            onConfirm={revoke}
          >
            <Button danger disabled={busy}>
              撤销邀请
            </Button>
          </Popconfirm>
        </Space>
      )}
      <Modal
        title={`${teacher.name} · 小程序邀请`}
        open={invitation !== null}
        onCancel={() => setInvitation(null)}
        footer={null}
        destroyOnHidden
      >
        {invitation && (
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Typography.Text>
              有效期至 {new Date(invitation.expiresAt).toLocaleString('zh-CN')}
            </Typography.Text>
            {invitation.codeImage && (
              <img
                src={invitation.codeImage}
                alt={`${teacher.name} 的小程序邀请二维码`}
                style={{ width: 240, maxWidth: '100%' }}
              />
            )}
            <Typography.Paragraph
              copyable={{ text: invitation.miniProgramPath }}
              style={{ wordBreak: 'break-all' }}
            >
              {invitation.miniProgramPath}
            </Typography.Paragraph>
          </Space>
        )}
      </Modal>
    </Space>
  );
}
