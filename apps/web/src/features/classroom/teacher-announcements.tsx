import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Drawer, Input, InputNumber, Segmented, Select, Tag, Typography } from 'antd';
import { useClassroomService } from '@/components/providers/classroom-system-provider';
import {
  classroomQueryKeys,
  ClassroomServiceError,
  type Announcement,
  type Student,
  type SeatLayout,
} from '@/lib';

const active = new Set(['WAITING_DISPLAY', 'DISPLAYING']);

function statusText(item: Announcement): string {
  if (item.status === 'WAITING_DISPLAY') return '等待大屏展示';
  if (item.status === 'DISPLAYING') {
    if (item.deliveries.some((delivery) => delivery.soundStatus === 'FAILED'))
      return '已展示，语音未播放';
    if (item.deliveries.some((delivery) => delivery.soundStatus === 'INTERRUPTED'))
      return '已展示，语音中断';
    return '展示中';
  }
  if (item.status === 'REPLIED') return `大屏回复：${item.reply?.text ?? ''}`;
  if (item.status === 'TIMED_OUT') return '已结束，未收到回复';
  if (item.status === 'FAILED') return '大屏未展示';
  return '已结束';
}

export function TeacherAnnouncements({
  open,
  onClose,
  classId,
  className,
  students,
  layout,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  students: Student[];
  layout: SeatLayout | undefined;
}) {
  const service = useClassroomService();
  const [mode, setMode] = useState<'CUSTOM' | 'STUDENT'>('CUSTOM');
  const [studentId, setStudentId] = useState<string>();
  const [body, setBody] = useState('');
  const [repeatCount, setRepeatCount] = useState(2);
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');
  const requestKey = useRef(crypto.randomUUID());
  const query = useQuery({
    queryKey: classroomQueryKeys.announcements(classId),
    queryFn: () => service.listAnnouncements(classId),
    enabled: open && Boolean(classId),
    refetchInterval: open ? 3_000 : false,
  });

  useEffect(() => {
    setStudentId(undefined);
    setSelectedId(null);
    setError('');
    requestKey.current = crypto.randomUUID();
  }, [classId]);

  const selected = students.find((student) => student.id === studentId);
  const preview =
    mode === 'STUDENT' && selected
      ? `${selected.name}，${body.trim() || '请到办公室'}`
      : body.trim();
  const estimatedMinimum = Math.ceil(
    (Array.from(preview).length / 3) * repeatCount + 2 * (repeatCount - 1) + 3,
  );
  const noSeat =
    mode === 'STUDENT' &&
    selected &&
    !layout?.seats.some((seat) => seat.student?.id === selected.id);
  const current = useMemo(
    () => query.data?.find((item) => item.id === selectedId) ?? query.data?.[0] ?? null,
    [query.data, selectedId],
  );

  const send = async () => {
    const text = mode === 'STUDENT' ? body.trim() || '请到办公室' : body.trim();
    if (!text || Array.from(text).length > 100 || (mode === 'STUDENT' && !selected)) {
      setError('请填写 1～100 字并选择本班学生');
      return;
    }
    if (estimatedMinimum > 180) {
      setError('请减少文字或播报次数');
      return;
    }
    if (durationSeconds < estimatedMinimum) {
      setError(`按预估语速播报需要至少 ${estimatedMinimum} 秒`);
      return;
    }
    setSending(true);
    setError('');
    try {
      const item = await service.createAnnouncement(classId, {
        mode,
        studentId: mode === 'STUDENT' ? selected?.id : undefined,
        text,
        repeatCount,
        durationSeconds,
        idempotencyKey: requestKey.current,
      });
      setSelectedId(item.id);
      requestKey.current = crypto.randomUUID();
      await query.refetch();
    } catch (cause) {
      setError(cause instanceof ClassroomServiceError ? cause.message : '发送失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const end = async () => {
    if (!current) return;
    setEnding(true);
    try {
      await service.endAnnouncement(classId, current.id);
      await query.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '结束失败，请重试');
    } finally {
      setEnding(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      size="min(85vh, 760px)"
      title="远程喊话"
      destroyOnHidden={false}
    >
      <div className="mx-auto flex max-w-lg flex-col gap-4 pb-6">
        <Typography.Text strong>{className}</Typography.Text>
        <Segmented
          block
          value={mode}
          onChange={(value) => {
            setMode(value as 'CUSTOM' | 'STUDENT');
            setError('');
          }}
          options={[
            { label: '自定义喊话', value: 'CUSTOM' },
            { label: '指定学生', value: 'STUDENT' },
          ]}
        />
        {mode === 'STUDENT' ? (
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            value={studentId}
            onChange={setStudentId}
            placeholder="选择学生"
            options={students
              .filter((item) => item.status === 'ACTIVE')
              .map((item) => ({
                value: item.id,
                label: `${item.name}${item.studentNo ? ` · ${item.studentNo}` : ''}`,
              }))}
            size="large"
          />
        ) : null}
        {noSeat ? (
          <Typography.Text type="warning">该学生暂无座位，将直接展示喊话</Typography.Text>
        ) : null}
        <Input.TextArea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={mode === 'STUDENT' ? '请到办公室' : '输入喊话内容'}
          maxLength={100}
          showCount
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="announcement-repeat">播报次数</label>
          <InputNumber
            id="announcement-repeat"
            min={1}
            max={5}
            precision={0}
            value={repeatCount}
            onChange={(value) => setRepeatCount(value ?? 2)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="announcement-duration">显示时长（秒）</label>
          <InputNumber
            id="announcement-duration"
            min={10}
            max={180}
            precision={0}
            value={durationSeconds}
            onChange={(value) => setDurationSeconds(value ?? 30)}
          />
        </div>
        <div className="flex gap-2">
          {[15, 30, 60].map((seconds) => (
            <Button key={seconds} onClick={() => setDurationSeconds(seconds)}>
              {seconds} 秒
            </Button>
          ))}
        </div>
        {preview ? <div className="rounded-xl bg-slate-50 p-3 text-base">{preview}</div> : null}
        {estimatedMinimum > durationSeconds && estimatedMinimum <= 180 ? (
          <Button onClick={() => setDurationSeconds(estimatedMinimum)}>
            调整为预估所需 {estimatedMinimum} 秒
          </Button>
        ) : null}
        {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
        <Button
          type="primary"
          size="large"
          block
          loading={sending}
          disabled={Boolean(current && active.has(current.status))}
          onClick={() => void send()}
        >
          发送喊话
        </Button>
        {current ? (
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <Tag color={active.has(current.status) ? 'processing' : 'default'}>
                {statusText(current)}
              </Tag>
              {active.has(current.status) ? (
                <Button loading={ending} onClick={() => void end()}>
                  结束喊话
                </Button>
              ) : null}
            </div>
            <div className="mt-2 break-words text-base">{current.text}</div>
            {current.reply ? (
              <div className="mt-2 text-sm text-slate-500">
                {new Date(current.reply.createdAt).toLocaleString('zh-CN')} · 大屏回复
              </div>
            ) : null}
          </div>
        ) : null}
        {query.data?.length ? (
          <div className="flex flex-col gap-2">
            <Typography.Text strong>最近喊话</Typography.Text>
            {query.data.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className="min-h-11 rounded-lg border border-slate-200 px-3 py-2 text-left"
              >
                <span className="block truncate">{item.text}</span>
                <span className="text-xs text-slate-500">{statusText(item)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
