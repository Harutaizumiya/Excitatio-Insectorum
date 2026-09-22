'use client';

import { Alert, Spin } from 'antd';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, GraduationCap, Link2, ShieldCheck } from 'lucide-react';

import { useClassroomService } from '@/components/providers/classroom-system-provider';
import { useConsumeInvitation } from '@/components/providers/query-hooks';
import type { InvitationPreview } from '@/lib';

export function InviteSurface({ token }: { token: string }): React.ReactElement {
  const service = useClassroomService();
  const consumeInvitation = useConsumeInvitation(token);
  const hasToken = token.length > 0;
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof consumeInvitation.mutateAsync>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!hasToken) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    void service.getInvitationPreview(token).then(
      (next) => {
        if (cancelled) return;
        setPreview(next);
        setPreviewLoading(false);
      },
      (reason) => {
        if (cancelled) return;
        setPreviewError(
          reason instanceof Error ? reason.message : '邀请信息加载失败，请稍后重试。',
        );
        setPreviewLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hasToken, service, token]);

  const handleActivate = async () => {
    setError(null);
    if (!hasToken) {
      setError('邀请链接无效，请联系班主任重新生成。');
      return;
    }

    try {
      const next = await consumeInvitation.mutateAsync({ deviceName: '教师端' });
      setResult(next);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '邀请链接无法使用，请联系班主任重新生成。',
      );
    }
  };

  if (result) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef5ff] px-4 py-8">
        <section className="w-full max-w-[430px] rounded-[30px] border border-[#dce8f7] bg-white p-6 text-center shadow-[0_18px_45px_rgba(42,82,141,0.09)]">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#eaf8f1] text-[#1d9a63]">
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </div>
          <p className="mt-6 text-xs font-medium tracking-[0.2em] text-[#6d83a5]">WELCOME ABOARD</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#102344]">
            已成功加入班级
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#71829d]">
            教师身份已激活，可以进入课堂快捷操作。
          </p>
          <div className="mt-7 rounded-2xl bg-[#f5f8fc] px-4 py-3 text-left">
            <p className="text-sm font-semibold text-[#263d61]">{result.classroom.name}</p>
            <p className="mt-1 text-xs text-[#8190a8]">
              {result.teacher.subject ?? '任课教师'} · {result.teacher.name}
            </p>
          </div>
          <Link
            to="/teacher"
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0a59f7] px-4 text-sm font-semibold text-white hover:bg-[#084bd4]"
          >
            进入教师端
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef5ff] px-4 py-8">
      <section className="w-full max-w-[430px] rounded-[30px] border border-[#dce8f7] bg-white p-6 shadow-[0_18px_45px_rgba(42,82,141,0.09)]">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-[#eaf2ff] text-[#0a59f7]">
            <GraduationCap className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-[#6d83a5]">CLASSROOM SYSTEM</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#102344]">加入班级</h1>
          </div>
        </div>
        <div className="mt-7 rounded-3xl bg-[#edf4ff] p-5">
          <p className="text-xs font-medium text-[#6981a7]">邀请链接</p>
          <p className="mt-1 text-lg font-semibold text-[#102344]">
            {preview
              ? `${preview.headTeacher.name} 邀请您加入 ${preview.classroom.name}`
              : previewLoading
                ? '正在加载邀请信息…'
                : '邀请信息暂不可用'}
          </p>
          <p className="mt-2 break-all text-xs text-[#8190a8]">Token {token.slice(0, 6)}…</p>
        </div>
        <div className="mt-6 flex gap-3 rounded-2xl border border-[#e0eaf6] px-4 py-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#0a59f7]" aria-hidden="true" />
          <p className="text-sm leading-6 text-[#5e7190]">
            确认后将通过后端验证邀请并激活教师身份。
          </p>
        </div>
        {previewError ? (
          <Alert
            className="mt-5"
            type="error"
            showIcon
            title="邀请信息加载失败"
            description={previewError}
          />
        ) : null}
        {!hasToken && !error ? (
          <Alert
            className="mt-5"
            type="error"
            showIcon
            title="邀请无法使用"
            description="邀请链接无效，请联系班主任重新生成。"
          />
        ) : null}
        {error ? (
          <Alert className="mt-5" type="error" showIcon title="邀请无法使用" description={error} />
        ) : null}
        <button
          type="button"
          disabled={!hasToken || consumeInvitation.isPending}
          onClick={() => void handleActivate()}
          className="mt-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-[#0a59f7] px-4 text-sm font-semibold text-white shadow-lg shadow-[#0a59f7]/20 hover:bg-[#084bd4] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {consumeInvitation.isPending ? (
            <Spin size="small" />
          ) : (
            <>
              <span>确认并激活</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </button>
        <Link
          to="/"
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#d5e1f1] px-4 text-sm font-medium text-[#526887] hover:border-[#0a59f7] hover:text-[#0a59f7]"
        >
          <Link2 className="size-4" aria-hidden="true" />
          返回首页
        </Link>
      </section>
    </main>
  );
}
