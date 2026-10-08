import { useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getSession, logout } from '../../lib/api.ts';
import { Card, ErrorText, PageFrame, PrimaryButton, SectionTitle } from '../../components/ui';

export default function ProfilePage() {
  const [teacher, setTeacher] = useState(getSession()?.teacher ?? null);
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useDidShow(() => {
    const session = getSession();
    if (!session) {
      void Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    setTeacher(session.teacher);
  });

  const signOut = async () => {
    const result = await Taro.showModal({
      title: '退出登录',
      content: '退出后需重新登录',
      confirmText: '退出',
    });
    if (!result.confirm || loggingOut) return;
    setLoggingOut(true);
    setError('');
    try {
      await logout();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '服务端退出未确认，本地会话已清除');
    } finally {
      setLoggingOut(false);
      await Taro.redirectTo({ url: '/pages/login/index' });
    }
  };

  return (
    <PageFrame title="我的" active="profile">
      <Card>
        <SectionTitle>教师账号</SectionTitle>
        <Text style={{ display: 'block', fontSize: '19px', fontWeight: '700' }}>
          {teacher?.name ?? '—'}
        </Text>
        <Text style={{ display: 'block', marginTop: '12px', color: '#218353' }}>微信已绑定</Text>
      </Card>
      <Card>
        <SectionTitle>账号恢复</SectionTitle>
        <Text style={{ display: 'block', color: '#52647d', lineHeight: '1.7' }}>
          课堂信息用于教学；退出清除会话和操作内容，仅保留结果核查编号。
        </Text>
        <Text style={{ display: 'block', color: '#52647d', lineHeight: '1.7', marginTop: '6px' }}>
          登录或绑定异常时，联系班主任核对教师账号和邀请目标。
        </Text>
        <Text style={{ display: 'block', color: '#52647d', lineHeight: '1.7', marginTop: '6px' }}>
          误绑定或账号冲突请人工核验；系统不会自动合并或换绑账号。
        </Text>
      </Card>
      <ErrorText>{error}</ErrorText>
      <View style={{ marginTop: '18px' }}>
        <PrimaryButton disabled={loggingOut} onClick={() => void signOut()}>
          {loggingOut ? '退出中…' : '退出登录'}
        </PrimaryButton>
      </View>
    </PageFrame>
  );
}
