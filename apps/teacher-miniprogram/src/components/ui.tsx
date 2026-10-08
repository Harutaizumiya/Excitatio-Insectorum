import type { ReactNode } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';

const primaryStyle = {
  minHeight: '48px',
  lineHeight: '48px',
  borderRadius: '12px',
  backgroundColor: '#1769e0',
  color: '#fff',
  fontSize: '16px',
};
const secondaryStyle = {
  minHeight: '48px',
  lineHeight: '48px',
  borderRadius: '12px',
  backgroundColor: '#eef3fb',
  color: '#17335f',
  fontSize: '15px',
};

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button style={primaryStyle} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button style={secondaryStyle} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

export function PageFrame({
  title,
  children,
  active,
}: {
  title: string;
  children: ReactNode;
  active: 'classroom' | 'history' | 'profile';
}) {
  return (
    <View style={{ minHeight: '100vh', backgroundColor: '#f4f7fc', color: '#15233a' }}>
      <View style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 16px 92px' }}>
        <Text
          style={{ display: 'block', fontSize: '23px', fontWeight: '700', marginBottom: '16px' }}
        >
          {title}
        </Text>
        {children}
      </View>
      <BottomNav active={active} />
    </View>
  );
}

export function BottomNav({ active }: { active: 'classroom' | 'history' | 'profile' }) {
  const items = [
    { id: 'classroom' as const, label: '课堂', url: '/pages/classroom/index' },
    { id: 'history' as const, label: '记录', url: '/pages/history/index' },
    { id: 'profile' as const, label: '我的', url: '/pages/profile/index' },
  ];
  return (
    <View
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        padding: '8px 10px calc(env(safe-area-inset-bottom) + 8px)',
        backgroundColor: '#fff',
        borderTop: '1px solid #e6ebf2',
      }}
    >
      {items.map((item) => (
        <Button
          key={item.id}
          plain
          style={{
            flex: 1,
            minHeight: '48px',
            lineHeight: '48px',
            border: '0',
            color: active === item.id ? '#1769e0' : '#66758b',
            fontWeight: active === item.id ? '700' : '400',
            fontSize: '15px',
          }}
          onClick={() => {
            if (active !== item.id) void Taro.redirectTo({ url: item.url });
          }}
        >
          {item.label}
        </Button>
      ))}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Text style={{ display: 'block', color: '#b42318', fontSize: '14px', margin: '8px 0' }}>
      {children}
    </Text>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: '14px',
        padding: '14px',
        marginBottom: '12px',
        boxShadow: '0 2px 8px rgba(20, 45, 80, .05)',
      }}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={{ display: 'block', fontWeight: '700', marginBottom: '10px' }}>{children}</Text>
  );
}
