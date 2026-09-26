import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Button, Input } from 'antd';
import {
  useClassroomService,
  useRealtimeClient,
} from '@/components/providers/classroom-system-provider';
import { getDisplaySession } from '@/lib/session';
import { ClassroomServiceError, type Announcement, type DisplayBootstrap } from '@/lib';

type Phase = 'HIGHLIGHT' | 'SHOW' | 'INPUT';

export function DisplayAnnouncement({
  data,
  onHighlightStart,
  onHighlightEnd,
  onFinish,
  activeRef,
}: {
  data: DisplayBootstrap;
  onHighlightStart: (studentId: string, name: string, row: number, col: number) => void;
  onHighlightEnd: () => void;
  onFinish: () => void;
  activeRef: RefObject<boolean>;
}) {
  const service = useClassroomService();
  const realtime = useRealtimeClient();
  const [item, setItem] = useState<Announcement | null>(null);
  const [phase, setPhase] = useState<Phase>('SHOW');
  const [soundEnabled, setSoundEnabled] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  );
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const itemRef = useRef<Announcement | null>(null);
  const dataRef = useRef(data);
  const callbacks = useRef({ onHighlightStart, onHighlightEnd, onFinish });
  const phaseRef = useRef<Phase>('SHOW');
  const highlightTimer = useRef<number | null>(null);
  const speechTimer = useRef<number | null>(null);
  const speechStartTimer = useRef<number | null>(null);
  const speechGeneration = useRef(0);
  const playedCount = useRef(0);
  const replyKey = useRef(crypto.randomUUID());
  const soundReadyQueue = useRef<Promise<void>>(Promise.resolve());
  dataRef.current = data;
  callbacks.current = { onHighlightStart, onHighlightEnd, onFinish };

  const setSoundReady = useCallback(
    (ready: boolean) => {
      const request = soundReadyQueue.current.then(() => service.setDisplaySoundReady(ready));
      soundReadyQueue.current = request.then(
        () => undefined,
        () => undefined,
      );
      return request;
    },
    [service],
  );

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const stopSpeech = () => {
    speechGeneration.current += 1;
    if (speechTimer.current !== null) window.clearTimeout(speechTimer.current);
    speechTimer.current = null;
    if (speechStartTimer.current !== null) window.clearTimeout(speechStartTimer.current);
    speechStartTimer.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const clear = () => {
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = null;
    stopSpeech();
    itemRef.current = null;
    activeRef.current = false;
    setItem(null);
    setReplyText('');
    setError('');
    callbacks.current.onFinish();
  };

  const reportPlayback = (
    id: string,
    status: 'PLAYING' | 'FAILED' | 'INTERRUPTED' | 'COMPLETED',
  ) => {
    void service.reportAnnouncementPlayback(id, status, playedCount.current).catch(() => undefined);
  };

  const speak = (announcement: Announcement) => {
    const deviceId = getDisplaySession()?.deviceId;
    if (!deviceId || announcement.primaryDeviceId !== deviceId) return;
    if (!('speechSynthesis' in window)) {
      reportPlayback(announcement.id, 'FAILED');
      setSoundEnabled(false);
      void setSoundReady(false).catch(() => undefined);
      return;
    }
    stopSpeech();
    const generation = speechGeneration.current;
    const play = () => {
      if (generation !== speechGeneration.current || phaseRef.current !== 'SHOW') return;
      const current = itemRef.current;
      const delivery = current?.deliveries.find((entry) => entry.deviceId === deviceId);
      if (
        !current ||
        current.id !== announcement.id ||
        !delivery?.expiresAt ||
        Date.now() >= new Date(delivery.expiresAt).getTime()
      )
        return;
      const utterance = new SpeechSynthesisUtterance(announcement.text);
      utterance.lang = 'zh-CN';
      utterance.rate = 1;
      const voice = window.speechSynthesis
        .getVoices()
        .find((candidate) => candidate.lang.toLowerCase().startsWith('zh-cn'));
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (generation !== speechGeneration.current) return;
        if (speechStartTimer.current !== null) window.clearTimeout(speechStartTimer.current);
        speechStartTimer.current = null;
        setSoundEnabled(true);
        setError('');
        void setSoundReady(true).catch(() => undefined);
        reportPlayback(announcement.id, 'PLAYING');
      };
      utterance.onend = () => {
        if (generation !== speechGeneration.current) return;
        if (speechStartTimer.current !== null) window.clearTimeout(speechStartTimer.current);
        speechStartTimer.current = null;
        playedCount.current += 1;
        if (playedCount.current >= announcement.repeatCount) {
          reportPlayback(announcement.id, 'COMPLETED');
        } else {
          reportPlayback(announcement.id, 'PLAYING');
          speechTimer.current = window.setTimeout(play, 2_000);
        }
      };
      utterance.onerror = (event) => {
        if (generation !== speechGeneration.current) return;
        if (speechStartTimer.current !== null) window.clearTimeout(speechStartTimer.current);
        speechStartTimer.current = null;
        reportPlayback(announcement.id, 'FAILED');
        if (event.error === 'canceled' || event.error === 'interrupted') return;
        setSoundEnabled(false);
        setError(
          event.error === 'not-allowed'
            ? '浏览器拦截了自动播报，请点击启用声音重试'
            : '语音播报失败，请点击启用声音重试',
        );
        void setSoundReady(false).catch(() => undefined);
      };
      try {
        speechStartTimer.current = window.setTimeout(() => {
          if (generation !== speechGeneration.current) return;
          speechStartTimer.current = null;
          speechGeneration.current += 1;
          window.speechSynthesis.cancel();
          setSoundEnabled(false);
          setError('自动播报未启动，请点击启用声音重试');
          void setSoundReady(false).catch(() => undefined);
          reportPlayback(announcement.id, 'FAILED');
        }, 5_000);
        window.speechSynthesis.speak(utterance);
      } catch {
        if (speechStartTimer.current !== null) window.clearTimeout(speechStartTimer.current);
        speechStartTimer.current = null;
        setSoundEnabled(false);
        setError('语音播报失败，请点击启用声音重试');
        void setSoundReady(false).catch(() => undefined);
        reportPlayback(announcement.id, 'FAILED');
      }
    };
    play();
  };

  const adopt = (next: Announcement | null) => {
    if (!next || !['WAITING_DISPLAY', 'DISPLAYING'].includes(next.status)) {
      if (itemRef.current) clear();
      return;
    }
    const deviceId = getDisplaySession()?.deviceId;
    const delivery = next.deliveries.find((entry) => entry.deviceId === deviceId);
    if (!delivery) return;
    if (itemRef.current?.id === next.id) {
      itemRef.current = next;
      setItem(next);
      if (phaseRef.current === 'INPUT' && !delivery.inputActive) {
        setPhaseBoth('SHOW');
        if (playedCount.current < next.repeatCount) speak(next);
      }
      return;
    }
    if (itemRef.current) clear();
    itemRef.current = next;
    activeRef.current = true;
    playedCount.current = delivery.playedCount;
    replyKey.current = crypto.randomUUID();
    setItem(next);
    if (delivery.displayedAt) {
      // Reconnect and refresh restore the remaining window without replaying speech or highlight.
      setPhaseBoth(delivery.inputActive ? 'INPUT' : 'SHOW');
      return;
    }
    const seat = next.studentId
      ? dataRef.current.layout.seats.find((entry) => entry.student?.id === next.studentId)
      : null;
    const show = async () => {
      if (itemRef.current?.id !== next.id) return;
      callbacks.current.onHighlightEnd();
      try {
        const acknowledged = await service.confirmAnnouncementDisplayed(next.id);
        if (itemRef.current?.id !== next.id) return;
        itemRef.current = acknowledged;
        setItem(acknowledged);
        setPhaseBoth('SHOW');
        speak(acknowledged);
      } catch {
        clear();
      }
    };
    if (seat?.student && next.studentId) {
      setPhaseBoth('HIGHLIGHT');
      callbacks.current.onHighlightStart(next.studentId, seat.student.name, seat.row, seat.col);
      highlightTimer.current = window.setTimeout(() => void show(), 2_000);
    } else {
      setPhaseBoth('SHOW');
      void show();
    }
  };

  // Event callbacks always use the latest state without resubscribing on every countdown tick.
  const adoptRef = useRef(adopt);
  adoptRef.current = adopt;

  useEffect(() => {
    const session = getDisplaySession();
    if (!session) return;
    const speechSupported = 'speechSynthesis' in window;
    setSoundEnabled(speechSupported);
    void setSoundReady(speechSupported).catch(() => setSoundEnabled(false));
    const sync = () =>
      void service
        .getCurrentAnnouncement()
        .then((next) => adoptRef.current(next))
        .catch(() => undefined);
    sync();
    const unsubEvent = realtime.subscribe('ANNOUNCEMENT_CHANGED', session.classId, sync);
    const unsubStatus = realtime.subscribeStatus((status) => {
      if (status === 'CONNECTED') sync();
    });
    const interval = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      const current = itemRef.current;
      const delivery = current?.deliveries.find((entry) => entry.deviceId === session.deviceId);
      if (
        current &&
        phaseRef.current === 'SHOW' &&
        delivery?.expiresAt &&
        currentTime >= new Date(delivery.expiresAt).getTime()
      ) {
        if (delivery.isPrimary && playedCount.current < current.repeatCount)
          reportPlayback(current.id, 'INTERRUPTED');
        clear();
      } else if (current) sync();
    }, 1_000);
    return () => {
      unsubEvent();
      unsubStatus();
      window.clearInterval(interval);
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
      if (speechTimer.current !== null) window.clearTimeout(speechTimer.current);
      if (speechStartTimer.current !== null) window.clearTimeout(speechStartTimer.current);
      speechGeneration.current += 1;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      activeRef.current = false;
    };
  }, [service, realtime, activeRef, setSoundReady]);

  const enableSound = () => {
    if (!('speechSynthesis' in window)) {
      setError('此浏览器不支持语音播报');
      return;
    }
    const current = itemRef.current;
    if (current && phaseRef.current === 'SHOW') {
      setError('');
      speak(current);
      return;
    }
    const test = new SpeechSynthesisUtterance('声音已启用');
    test.lang = 'zh-CN';
    test.onend = () => {
      void setSoundReady(true)
        .then(() => {
          setSoundEnabled(true);
          setError('');
        })
        .catch(() => setError('声音启用失败，请重试'));
    };
    test.onerror = () => {
      setSoundEnabled(false);
      setError('声音启用失败，请检查设备音量并重试');
      void setSoundReady(false).catch(() => undefined);
    };
    window.speechSynthesis.speak(test);
  };

  const beginInput = async () => {
    if (!item) return;
    setError('');
    try {
      const updated = await service.setAnnouncementInput(item.id, 'START');
      stopSpeech();
      itemRef.current = updated;
      setItem(updated);
      setPhaseBoth('INPUT');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法输入回复');
    }
  };

  const returnToDisplay = async () => {
    if (!item) return;
    try {
      const updated = await service.setAnnouncementInput(item.id, 'RETURN');
      itemRef.current = updated;
      setItem(updated);
      setPhaseBoth('SHOW');
      if (playedCount.current < updated.repeatCount) speak(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '返回失败，请重试');
    }
  };

  const reply = async (type: 'QUICK' | 'CUSTOM') => {
    if (!item || submitting) return;
    const text = replyText.trim();
    if (type === 'CUSTOM' && (!text || Array.from(text).length > 100)) {
      setError('回复应为 1～100 字');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await service.replyAnnouncement(item.id, {
        type,
        text: type === 'CUSTOM' ? text : undefined,
        idempotencyKey: replyKey.current,
      });
      clear();
    } catch (cause) {
      setError(
        cause instanceof ClassroomServiceError && cause.code === 'ANNOUNCEMENT_ENDED'
          ? '该喊话已结束'
          : '回复失败，请重试',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const deviceId = getDisplaySession()?.deviceId;
  const delivery = item?.deliveries.find((entry) => entry.deviceId === deviceId);
  const remaining = delivery?.expiresAt
    ? Math.max(0, Math.ceil((new Date(delivery.expiresAt).getTime() - now) / 1_000))
    : (item?.durationSeconds ?? 0);
  return (
    <>
      {!soundEnabled ? (
        <div className="pointer-events-auto fixed bottom-5 right-5 z-[60] rounded-xl bg-white p-3 shadow-lg">
          <Button type="primary" size="large" onClick={enableSound}>
            启用声音
          </Button>
          {error && !item ? <div className="mt-2 text-red-600">{error}</div> : null}
        </div>
      ) : null}
      {item && phase !== 'HIGHLIGHT' ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="远程喊话"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-slate-950/95 px-6 py-10 text-white"
        >
          <div className="w-full max-w-5xl text-center">
            <div className="text-2xl text-slate-300">{item.teacherName}老师 · 远程喊话</div>
            {item.studentName ? (
              <div className="mt-8 text-5xl font-bold">{item.studentName}</div>
            ) : null}
            <div className="mt-8 break-words text-4xl font-semibold leading-relaxed md:text-6xl">
              {item.text}
            </div>
            {phase !== 'INPUT' ? (
              <div className="mt-8 text-2xl text-slate-300">剩余 {remaining} 秒</div>
            ) : null}
            {phase === 'INPUT' ? (
              <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-4">
                <Input.TextArea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  maxLength={100}
                  showCount
                  autoSize={{ minRows: 3, maxRows: 5 }}
                  placeholder="输入回复"
                />
                <div className="flex gap-4">
                  <Button
                    size="large"
                    className="min-h-12 flex-1"
                    onClick={() => void returnToDisplay()}
                  >
                    返回
                  </Button>
                  <Button
                    type="primary"
                    size="large"
                    className="min-h-12 flex-1"
                    loading={submitting}
                    onClick={() => void reply('CUSTOM')}
                  >
                    发送回复
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-10 flex flex-wrap justify-center gap-5">
                <Button
                  type="primary"
                  size="large"
                  className="min-h-14 min-w-40 text-xl"
                  loading={submitting}
                  onClick={() => void reply('QUICK')}
                >
                  知道了
                </Button>
                <Button
                  size="large"
                  className="min-h-14 min-w-40 text-xl"
                  disabled={submitting}
                  onClick={() => void beginInput()}
                >
                  自定义回复
                </Button>
              </div>
            )}
            {error ? (
              <div role="alert" className="mt-6 text-xl text-red-300">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
