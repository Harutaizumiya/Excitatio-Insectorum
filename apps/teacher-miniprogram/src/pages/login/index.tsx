import { useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useLoad } from '@tarojs/taro';
import {
  bindWechat,
  getSession,
  previewInvitation,
  setActiveClassId,
  wechatLogin,
} from '../../lib/api.ts';
import { Card, ErrorText, PrimaryButton } from '../../components/ui';

export default function LoginPage() {
  const [invitation, setInvitation] = useState<Awaited<
    ReturnType<typeof previewInvitation>
  > | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [binding, setBinding] = useState(false);
  const restoring = useRef(false);
  const inviteTokenRef = useRef('');
  const invitationRef = useRef<typeof invitation>(null);
  const loginLock = useRef(false);
  const bindingLock = useRef(false);

  const loadPreview = async (token: string) => {
    setError('');
    try {
      const preview = await previewInvitation(token);
      invitationRef.current = preview;
      setInvitation(preview);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '邀请暂不可用');
    }
  };

  useLoad((query) => {
    let scene = typeof query.scene === 'string' ? query.scene : '';
    try {
      scene = decodeURIComponent(scene);
    } catch {
      // Keep the raw scene so the server can return the authoritative token error.
    }
    const token = typeof query.token === 'string' ? query.token : scene;
    inviteTokenRef.current = token;
    setInviteToken(token);
    if (!token) return;
    void loadPreview(token);
  });

  useDidShow(() => {
    const session = getSession();
    if (!session || restoring.current) return;
    restoring.current = true;
    void (async () => {
      try {
        const token = inviteTokenRef.current;
        if (token) {
          const verified = invitationRef.current ?? (await previewInvitation(token));
          if (verified.teacher.id !== session.teacher.id) {
            setError('当前微信已绑定其他教师账号，请联系班主任核对邀请');
            return;
          }
          invitationRef.current = verified;
          setInvitation(verified);
          setActiveClassId(verified.classroom.id);
        }
        await Taro.redirectTo({ url: '/pages/classroom/index' });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '登录状态恢复失败');
      } finally {
        restoring.current = false;
      }
    })();
  });

  const login = async () => {
    if (loginLock.current) return;
    loginLock.current = true;
    setLoading(true);
    setError('');
    try {
      const { code } = await Taro.login();
      if (!code) throw new Error('微信登录未完成，请重试');
      const result = await wechatLogin(code);
      if (result.status === 'BOUND') {
        let verifiedInvitation = invitation;
        if (inviteToken && !verifiedInvitation) {
          try {
            verifiedInvitation = await previewInvitation(inviteToken);
            setInvitation(verifiedInvitation);
          } catch {
            // Expired or invalid invitations do not prevent ordinary bound login.
          }
        }
        if (verifiedInvitation && verifiedInvitation.teacher.id !== result.teacher.id) {
          setError('当前微信已绑定其他教师账号，请联系班主任核对邀请');
          return;
        }
        if (verifiedInvitation) setActiveClassId(verifiedInvitation.classroom.id);
        await Taro.redirectTo({ url: '/pages/classroom/index' });
        return;
      }
      setTicket(result.ticket);
      if (!inviteToken) setError('请从班主任发出的邀请进入');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '微信登录失败，请重试');
    } finally {
      loginLock.current = false;
      setLoading(false);
    }
  };

  const confirmBinding = async () => {
    if (!ticket || !inviteToken || !invitation || bindingLock.current) return;
    bindingLock.current = true;
    setBinding(true);
    setError('');
    try {
      const result = await bindWechat(ticket, inviteToken);
      if (result.classroom?.id) setActiveClassId(result.classroom.id);
      await Taro.redirectTo({ url: '/pages/classroom/index' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '绑定失败，请重新核对邀请');
      const statusCode =
        typeof reason === 'object' && reason !== null && 'statusCode' in reason
          ? Number((reason as { statusCode: unknown }).statusCode)
          : null;
      if (statusCode !== null && statusCode >= 400 && statusCode < 500) setTicket(null);
    } finally {
      bindingLock.current = false;
      setBinding(false);
    }
  };

  return (
    <View
      style={{
        minHeight: '100vh',
        backgroundColor: '#f4f7fc',
        padding: 'calc(env(safe-area-inset-top) + 24px) 18px',
      }}
    >
      <Text style={{ display: 'block', fontSize: '26px', fontWeight: '700', marginBottom: '20px' }}>
        教师登录
      </Text>
      {invitation && (
        <Card>
          <Text
            style={{ display: 'block', fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}
          >
            {invitation.classroom.name}
          </Text>
          <Text style={{ display: 'block', color: '#52647d', marginBottom: '4px' }}>
            {invitation.teacher.name}
            {invitation.teacher.subject ? ` · ${invitation.teacher.subject}` : ''}
          </Text>
          <Text style={{ display: 'block', color: '#8491a4', fontSize: '13px' }}>
            班主任：{invitation.headTeacher.name}
          </Text>
        </Card>
      )}
      {!invitation && inviteToken && !error && <Text>正在核对邀请…</Text>}
      <ErrorText>{error}</ErrorText>
      {!ticket ? (
        <PrimaryButton disabled={loading} onClick={() => void login()}>
          {loading ? '登录中…' : '微信登录'}
        </PrimaryButton>
      ) : invitation ? (
        <View>
          <Text style={{ display: 'block', marginBottom: '12px', color: '#52647d' }}>
            绑定后将进入 {invitation.classroom.name}
          </Text>
          <PrimaryButton disabled={binding} onClick={() => void confirmBinding()}>
            {binding ? '绑定中…' : '确认绑定'}
          </PrimaryButton>
        </View>
      ) : inviteToken ? (
        <Button
          style={{ minHeight: '48px', lineHeight: '48px' }}
          disabled={loading}
          onClick={() => void loadPreview(inviteToken)}
        >
          重新核对邀请
        </Button>
      ) : (
        <Text style={{ display: 'block', color: '#52647d' }}>请从班主任发出的邀请进入</Text>
      )}
    </View>
  );
}
