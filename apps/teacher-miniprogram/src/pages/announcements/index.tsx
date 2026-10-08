import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Picker, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useLoad } from '@tarojs/taro';
import {
  createAnnouncement,
  endAnnouncement,
  getActiveClassId,
  getAnnouncementByKey,
  getSession,
  listAnnouncements,
  listClassrooms,
  listStudents,
  setActiveClassId,
  type Announcement,
  type ClassroomSummary,
  type CreateAnnouncementInput,
  type Student,
} from '../../lib/api.ts';
import { Card, ErrorText, PrimaryButton, SecondaryButton, SectionTitle } from '../../components/ui';
import { loadAllStudents } from '../../features/students.ts';
import { minimumAnnouncementSeconds, validateAnnouncement } from '../../features/announcements.ts';
import {
  hasPendingWrite,
  isOwnedPendingWrite,
  ownedPendingWrite,
} from '../../features/pending-write.ts';

type Mode = 'CUSTOM' | 'STUDENT';
const PAGE_SIZE = 100;

function statusLabel(status: Announcement['status']): string {
  const labels: Record<Announcement['status'], string> = {
    WAITING_DISPLAY: '等待大屏',
    DISPLAYING: '展示中',
    REPLIED: '已回复',
    TIMED_OUT: '已超时',
    ENDED: '已结束',
    FAILED: '未送达',
  };
  return labels[status];
}

function createRequestKey(classId: string): string {
  return `teacher-announcement:${classId}:${Date.now()}:${Math.floor(Math.random() * 0x1_0000_0000).toString(36)}`;
}

function pendingKey(classId: string, teacherId: string): string {
  return `teacher-miniprogram:pending-announcement:${encodeURIComponent(teacherId)}:${encodeURIComponent(classId)}`;
}

function legacyPendingKey(classId: string): string {
  return `teacher-miniprogram:pending-announcement:${classId}`;
}

export default function AnnouncementsPage() {
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [mode, setMode] = useState<Mode>('CUSTOM');
  const [studentId, setStudentId] = useState('');
  const [text, setText] = useState('');
  const [repeatCount, setRepeatCount] = useState(1);
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pendingInput, setPendingInput] = useState<CreateAnnouncementInput | null>(null);
  const [pendingBlocked, setPendingBlocked] = useState(false);
  const [pendingLookupOnly, setPendingLookupOnly] = useState(false);
  const loadVersion = useRef(0);
  const polling = useRef(false);
  const classEpoch = useRef(0);
  const classIdRef = useRef('');
  const teacherIdRef = useRef('');
  const sendLock = useRef(false);
  const redirecting = useRef(false);
  const session = getSession();
  const classIndex = Math.max(
    0,
    classrooms.findIndex((item) => item.id === classId),
  );
  const selectedStudent = students.find((item) => item.id === studentId) ?? null;
  const speechText =
    mode === 'STUDENT' && selectedStudent ? `${selectedStudent.name}，${text.trim()}` : text.trim();
  const minimumSeconds = useMemo(
    () => minimumAnnouncementSeconds(speechText, repeatCount),
    [speechText, repeatCount],
  );
  const validation = validateAnnouncement(text, repeatCount, durationSeconds, minimumSeconds);

  useLoad((query) => {
    if (typeof query.classId === 'string') setClassId(query.classId);
  });

  const refreshAnnouncements = async (targetClassId: string, silent = false) => {
    if (!targetClassId || polling.current) return;
    const targetTeacherId = getSession()?.teacher.id;
    if (!targetTeacherId) {
      setVisible(false);
      setStudents([]);
      setAnnouncements([]);
      setPendingInput(null);
      setPendingBlocked(false);
      setPendingLookupOnly(false);
      setStudentId('');
      if (!redirecting.current) {
        redirecting.current = true;
        void Taro.redirectTo({ url: '/pages/login/index' });
      }
      return;
    }
    const targetEpoch = classEpoch.current;
    const isCurrent = () =>
      classIdRef.current === targetClassId &&
      classEpoch.current === targetEpoch &&
      getSession()?.teacher.id === targetTeacherId;
    polling.current = true;
    try {
      const result = await listAnnouncements(targetClassId);
      if (!isCurrent()) return;
      setAnnouncements(result);
      if (!silent) setError('');
      if (pendingLookupOnly && pendingInput) {
        await lookupAnnouncement(pendingInput, targetClassId, targetTeacherId, targetEpoch, silent);
      }
    } catch (reason) {
      if (!getSession()) {
        setStudents([]);
        setAnnouncements([]);
        setPendingInput(null);
        setPendingLookupOnly(false);
        setVisible(false);
        void Taro.redirectTo({ url: '/pages/login/index' });
      } else if (!silent && isCurrent()) {
        const statusCode =
          typeof reason === 'object' && reason !== null && 'statusCode' in reason
            ? Number((reason as { statusCode: unknown }).statusCode)
            : null;
        if (statusCode === 403) {
          setStudents([]);
          setAnnouncements([]);
          setError('无权访问此班级，请刷新班级列表或联系班主任');
        } else {
          setError(reason instanceof Error ? reason.message : '喊话记录加载失败');
        }
      }
    } finally {
      polling.current = false;
    }
  };

  const loadPage = async () => {
    const currentSession = getSession();
    if (!currentSession) {
      setVisible(false);
      setStudents([]);
      setAnnouncements([]);
      setPendingInput(null);
      setPendingBlocked(false);
      setPendingLookupOnly(false);
      setStudentId('');
      await Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    const teacherId = currentSession.teacher.id;
    const accountChanged = Boolean(teacherIdRef.current && teacherIdRef.current !== teacherId);
    if (accountChanged) {
      loadVersion.current += 1;
      classEpoch.current += 1;
      classIdRef.current = '';
      setActiveClassId(null);
      setClassrooms([]);
      setClassId('');
      setStudents([]);
      setStudentId('');
      setText('');
      setMode('CUSTOM');
      setPendingInput(null);
      setPendingBlocked(false);
      setPendingLookupOnly(false);
      setAnnouncements([]);
      setSubmitting(false);
    }
    teacherIdRef.current = teacherId;
    setLoading(true);
    setError('');
    const version = ++loadVersion.current;
    try {
      const available = await listClassrooms();
      if (version !== loadVersion.current || getSession()?.teacher.id !== teacherId) return;
      setClassrooms(available);
      const requestedId = accountChanged ? getActiveClassId() : classId || getActiveClassId();
      const selected = available.find((item) => item.id === requestedId) ?? available[0] ?? null;
      if (!selected) {
        classIdRef.current = '';
        classEpoch.current += 1;
        setClassId('');
        setStudents([]);
        setAnnouncements([]);
        setPendingInput(null);
        setPendingBlocked(false);
        setPendingLookupOnly(false);
        return;
      }
      if (selected.id !== getActiveClassId()) setActiveClassId(selected.id);
      if (selected.id !== classIdRef.current) {
        classIdRef.current = selected.id;
        classEpoch.current += 1;
      }
      setClassId(selected.id);
      const [allStudents, records] = await Promise.all([
        loadAllStudents(
          selected.id,
          listStudents,
          PAGE_SIZE,
          () => version === loadVersion.current && getSession()?.teacher.id === teacherId,
        ),
        listAnnouncements(selected.id),
      ]);
      if (version !== loadVersion.current || getSession()?.teacher.id !== teacherId) return;
      const activeStudents = allStudents.filter(
        (student) => student.status === 'ACTIVE' && !student.deletedAt,
      );
      setStudents(activeStudents);
      setAnnouncements(records);
      const stored = Taro.getStorageSync(pendingKey(selected.id, teacherId));
      if (
        isOwnedPendingWrite<CreateAnnouncementInput>(stored, teacherId, selected.id) &&
        typeof stored.input.idempotencyKey === 'string' &&
        Boolean(stored.input.idempotencyKey.trim())
      ) {
        setPendingInput(stored.input);
        setPendingBlocked(false);
        setPendingLookupOnly(stored.lookupOnly === true);
      } else {
        setPendingInput(null);
        setPendingLookupOnly(false);
        const legacy = Taro.getStorageSync(legacyPendingKey(selected.id));
        setPendingBlocked(hasPendingWrite(stored) || hasPendingWrite(legacy));
      }
      if (!studentId || !activeStudents.some((student) => student.id === studentId)) {
        setStudentId(activeStudents[0]?.id ?? '');
      }
    } catch (reason) {
      if (!getSession()) {
        setStudents([]);
        setAnnouncements([]);
        setPendingInput(null);
        setPendingBlocked(false);
        setPendingLookupOnly(false);
        setStudentId('');
        void Taro.redirectTo({ url: '/pages/login/index' });
      } else if (version === loadVersion.current && getSession()?.teacher.id === teacherId) {
        const statusCode =
          typeof reason === 'object' && reason !== null && 'statusCode' in reason
            ? Number((reason as { statusCode: unknown }).statusCode)
            : null;
        if (statusCode === 403) {
          setStudents([]);
          setAnnouncements([]);
          setError('无权访问此班级，请刷新班级列表或联系班主任');
        } else {
          setError(reason instanceof Error ? reason.message : '喊话页面加载失败');
        }
      }
    } finally {
      if (version === loadVersion.current && getSession()?.teacher.id === teacherId)
        setLoading(false);
    }
  };

  useDidShow(() => {
    setVisible(true);
    void loadPage();
  });
  useDidHide(() => setVisible(false));

  useEffect(() => {
    if (!visible || !classId) return undefined;
    const timer = setInterval(() => void refreshAnnouncements(classId, true), 3000);
    return () => clearInterval(timer);
  }, [visible, classId, pendingLookupOnly, pendingInput]);

  const switchClass = async (nextClassId: string) => {
    if (nextClassId === classId) return;
    const currentTeacherId = getSession()?.teacher.id;
    if (!currentTeacherId) {
      await Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    if (sendLock.current) {
      Taro.showToast({ title: '发送完成后再切换', icon: 'none' });
      return;
    }
    const originClassId = classIdRef.current;
    const originEpoch = classEpoch.current;
    const originTeacherId = currentTeacherId;
    if (text.trim() || pendingInput || pendingBlocked || (mode === 'STUDENT' && studentId)) {
      const result = await Taro.showModal({
        title: '切换班级',
        content: '切换后将清除草稿，待确认请求会保留',
        confirmText: '继续切换',
      });
      if (
        !result.confirm ||
        classIdRef.current !== originClassId ||
        classEpoch.current !== originEpoch ||
        getSession()?.teacher.id !== originTeacherId
      )
        return;
      if (sendLock.current) {
        Taro.showToast({ title: '发送完成后再切换', icon: 'none' });
        return;
      }
    }
    loadVersion.current += 1;
    classEpoch.current += 1;
    classIdRef.current = nextClassId;
    setActiveClassId(nextClassId);
    setClassId(nextClassId);
    setStudents([]);
    setStudentId('');
    setText('');
    const stored = Taro.getStorageSync(pendingKey(nextClassId, currentTeacherId));
    if (
      isOwnedPendingWrite<CreateAnnouncementInput>(stored, currentTeacherId, nextClassId) &&
      typeof stored.input.idempotencyKey === 'string' &&
      Boolean(stored.input.idempotencyKey.trim())
    ) {
      setPendingInput(stored.input);
      setPendingBlocked(false);
      setPendingLookupOnly(stored.lookupOnly === true);
    } else {
      setPendingInput(null);
      setPendingLookupOnly(false);
      const legacy = Taro.getStorageSync(legacyPendingKey(nextClassId));
      setPendingBlocked(hasPendingWrite(stored) || hasPendingWrite(legacy));
    }
    setAnnouncements([]);
    const version = ++loadVersion.current;
    setLoading(true);
    setError('');
    try {
      const [allStudents, records] = await Promise.all([
        loadAllStudents(
          nextClassId,
          listStudents,
          PAGE_SIZE,
          () => version === loadVersion.current && getSession()?.teacher.id === currentTeacherId,
        ),
        listAnnouncements(nextClassId),
      ]);
      if (version !== loadVersion.current || getSession()?.teacher.id !== currentTeacherId) return;
      const activeStudents = allStudents.filter(
        (student) => student.status === 'ACTIVE' && !student.deletedAt,
      );
      setStudents(activeStudents);
      setAnnouncements(records);
      setStudentId(activeStudents[0]?.id ?? '');
    } catch (reason) {
      if (!getSession()) {
        setStudents([]);
        setAnnouncements([]);
        setPendingInput(null);
        setPendingLookupOnly(false);
        setVisible(false);
        void Taro.redirectTo({ url: '/pages/login/index' });
      } else if (version === loadVersion.current && getSession()?.teacher.id === currentTeacherId) {
        const statusCode =
          typeof reason === 'object' && reason !== null && 'statusCode' in reason
            ? Number((reason as { statusCode: unknown }).statusCode)
            : null;
        if (statusCode === 403) {
          setStudents([]);
          setAnnouncements([]);
          setError('无权访问此班级，请刷新班级列表或联系班主任');
        } else {
          setError(reason instanceof Error ? reason.message : '喊话页面加载失败');
        }
      }
    } finally {
      if (version === loadVersion.current && getSession()?.teacher.id === currentTeacherId)
        setLoading(false);
    }
  };

  const makeInput = (): CreateAnnouncementInput => ({
    mode,
    ...(mode === 'STUDENT' ? { studentId } : {}),
    text: text.trim(),
    repeatCount,
    durationSeconds,
    idempotencyKey: createRequestKey(classId),
  });

  const lookupAnnouncement = async (
    input: CreateAnnouncementInput,
    targetClassId: string,
    targetTeacherId: string,
    targetEpoch: number,
    silent = false,
  ) => {
    const isCurrent = () =>
      classIdRef.current === targetClassId &&
      classEpoch.current === targetEpoch &&
      getSession()?.teacher.id === targetTeacherId;
    try {
      const existing = await getAnnouncementByKey(targetClassId, input.idempotencyKey);
      if (!isCurrent()) return;
      Taro.removeStorageSync(pendingKey(targetClassId, targetTeacherId));
      setPendingInput(null);
      setPendingLookupOnly(false);
      setPendingBlocked(false);
      setAnnouncements((current) => [
        existing,
        ...current.filter((item) => item.id !== existing.id),
      ]);
      Taro.showToast({ title: '已发送', icon: 'success' });
    } catch (reason) {
      if (!getSession()) {
        setStudents([]);
        setAnnouncements([]);
        setPendingInput(null);
        setPendingLookupOnly(false);
        setStudentId('');
        setVisible(false);
        void Taro.redirectTo({ url: '/pages/login/index' });
        return;
      }
      if (!isCurrent()) return;
      const statusCode =
        typeof reason === 'object' && reason !== null && 'statusCode' in reason
          ? Number((reason as { statusCode: unknown }).statusCode)
          : null;
      if (!silent) {
        setError(statusCode === 404 ? '暂未查到原请求，记录仍待确认' : '核查失败，记录仍待确认');
      }
    }
  };

  const send = async (input: CreateAnnouncementInput) => {
    if (!classId || sendLock.current || pendingLookupOnly || pendingBlocked) return;
    const targetTeacherId = getSession()?.teacher.id;
    if (!targetTeacherId) return;
    sendLock.current = true;
    const targetClassId = classId;
    const storageKey = pendingKey(targetClassId, targetTeacherId);
    const targetEpoch = classEpoch.current;
    const isCurrent = () =>
      classIdRef.current === targetClassId &&
      classEpoch.current === targetEpoch &&
      getSession()?.teacher.id === targetTeacherId;
    setSubmitting(true);
    setError('');
    try {
      Taro.setStorageSync(storageKey, ownedPendingWrite(targetTeacherId, targetClassId, input));
      setPendingInput(input);
      const created = await createAnnouncement(targetClassId, input);
      Taro.removeStorageSync(storageKey);
      if (!isCurrent()) return;
      setPendingInput(null);
      setPendingLookupOnly(false);
      setText('');
      setAnnouncements((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      Taro.showToast({ title: '已发送', icon: 'success' });
    } catch (reason) {
      if (!getSession()) {
        setStudents([]);
        setAnnouncements([]);
        setPendingInput(null);
        setPendingBlocked(false);
        setPendingLookupOnly(false);
        setStudentId('');
        void Taro.redirectTo({ url: '/pages/login/index' });
      } else if (isCurrent()) {
        const statusCode =
          typeof reason === 'object' && reason !== null && 'statusCode' in reason
            ? Number((reason as { statusCode: unknown }).statusCode)
            : null;
        if (
          statusCode !== null &&
          statusCode >= 400 &&
          statusCode < 500 &&
          statusCode !== 401 &&
          statusCode !== 409
        ) {
          Taro.removeStorageSync(storageKey);
          setPendingInput(null);
          setPendingLookupOnly(false);
          setError(reason instanceof Error ? reason.message : '发送失败');
          return;
        }
        setPendingInput(input);
        setPendingLookupOnly(false);
        setError(statusCode === 409 ? '正在核查原喊话请求…' : '发送结果待确认，请先核对记录');
        await lookupAnnouncement(input, targetClassId, targetTeacherId, targetEpoch);
      }
      if (getSession()?.teacher.id === targetTeacherId)
        await refreshAnnouncements(targetClassId, true);
    } finally {
      sendLock.current = false;
      if (isCurrent()) setSubmitting(false);
    }
  };

  const checkPendingAnnouncement = () => {
    if (!pendingInput || !classId || submitting || sendLock.current) return;
    const teacherId = getSession()?.teacher.id;
    if (!teacherId) {
      void Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    sendLock.current = true;
    setSubmitting(true);
    void lookupAnnouncement(pendingInput, classId, teacherId, classEpoch.current).finally(() => {
      sendLock.current = false;
      setSubmitting(false);
    });
  };

  const sendAnnouncement = () => {
    if (validation || !classId || (mode === 'STUDENT' && !studentId)) {
      setError(mode === 'STUDENT' && !studentId ? '请选择学生' : (validation ?? '请选择班级'));
      return;
    }
    void send(makeInput());
  };

  const finishAnnouncement = async (announcement: Announcement) => {
    const targetTeacherId = getSession()?.teacher.id;
    if (!targetTeacherId) {
      await Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    const targetClassId = classId;
    const targetEpoch = classEpoch.current;
    const confirmed = await Taro.showModal({
      title: '结束喊话',
      content: '确定结束这条喊话？',
      confirmText: '结束',
    });
    if (
      !confirmed.confirm ||
      classIdRef.current !== targetClassId ||
      classEpoch.current !== targetEpoch ||
      getSession()?.teacher.id !== targetTeacherId
    )
      return;
    try {
      const updated = await endAnnouncement(targetClassId, announcement.id);
      if (
        classIdRef.current !== targetClassId ||
        classEpoch.current !== targetEpoch ||
        getSession()?.teacher.id !== targetTeacherId
      )
        return;
      setAnnouncements((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      Taro.showToast({ title: '已结束', icon: 'success' });
    } catch (reason) {
      if (
        classIdRef.current === targetClassId &&
        classEpoch.current === targetEpoch &&
        getSession()?.teacher.id === targetTeacherId
      ) {
        setError(reason instanceof Error ? reason.message : '结束失败');
      }
      if (getSession()?.teacher.id === targetTeacherId)
        await refreshAnnouncements(targetClassId, true);
    }
  };

  const active = announcements.filter((item) =>
    ['WAITING_DISPLAY', 'DISPLAYING'].includes(item.status),
  );

  return (
    <View
      style={{
        minHeight: '100vh',
        backgroundColor: '#f4f7fc',
        color: '#15233a',
        padding:
          'calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 20px)',
      }}
    >
      <View
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <Text style={{ fontSize: '23px', fontWeight: '700' }}>远程喊话</Text>
        <Text
          onClick={() => void Taro.navigateBack()}
          style={{ padding: '10px', color: '#52647d' }}
        >
          返回
        </Text>
      </View>
      {classrooms.length > 1 && (
        <Picker
          mode="selector"
          range={classrooms.map((item) => item.name)}
          value={classIndex}
          onChange={(event) => {
            const next = classrooms[Number(event.detail.value)];
            if (next) void switchClass(next.id);
          }}
        >
          <Card>
            <Text>{classrooms[classIndex]?.name ?? '选择班级'} ›</Text>
          </Card>
        </Picker>
      )}
      <ErrorText>{error}</ErrorText>
      {loading && (
        <Text style={{ display: 'block', color: '#74849a', padding: '8px 0' }}>加载中…</Text>
      )}
      {!loading && classrooms.length === 0 && (
        <Card>
          <Text>暂无可用班级</Text>
        </Card>
      )}

      {classId && (
        <>
          {pendingBlocked && (
            <Text style={{ display: 'block', color: '#a45b00', marginBottom: '10px' }}>
              有一条待确认记录无法核对所属教师，请联系班主任确认。
            </Text>
          )}
          <Card>
            <SectionTitle>新建喊话</SectionTitle>
            <View style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <View style={{ flex: 1 }}>
                {mode === 'CUSTOM' ? (
                  <PrimaryButton
                    disabled={Boolean(pendingInput) || pendingBlocked}
                    onClick={() => setMode('CUSTOM')}
                  >
                    自定义
                  </PrimaryButton>
                ) : (
                  <SecondaryButton
                    disabled={Boolean(pendingInput) || pendingBlocked}
                    onClick={() => setMode('CUSTOM')}
                  >
                    自定义
                  </SecondaryButton>
                )}
              </View>
              <View style={{ flex: 1 }}>
                {mode === 'STUDENT' ? (
                  <PrimaryButton
                    disabled={Boolean(pendingInput) || pendingBlocked}
                    onClick={() => setMode('STUDENT')}
                  >
                    指定学生
                  </PrimaryButton>
                ) : (
                  <SecondaryButton
                    disabled={Boolean(pendingInput) || pendingBlocked}
                    onClick={() => setMode('STUDENT')}
                  >
                    指定学生
                  </SecondaryButton>
                )}
              </View>
            </View>
            {mode === 'STUDENT' && (
              <Picker
                mode="selector"
                disabled={Boolean(pendingInput)}
                range={students.map((student) => student.name)}
                value={Math.max(
                  0,
                  students.findIndex((item) => item.id === studentId),
                )}
                onChange={(event) => {
                  const selected = students[Number(event.detail.value)];
                  if (selected) setStudentId(selected.id);
                }}
              >
                <View
                  style={{
                    minHeight: '48px',
                    padding: '12px',
                    borderRadius: '10px',
                    backgroundColor: '#f2f5fa',
                    marginBottom: '10px',
                  }}
                >
                  <Text>{selectedStudent?.name ?? '选择学生'} ›</Text>
                </View>
              </Picker>
            )}
            <Input
              value={text}
              disabled={Boolean(pendingInput) || pendingBlocked}
              maxlength={100}
              onInput={(event) => setText(event.detail.value)}
              placeholder="喊话内容"
              style={{
                minHeight: '48px',
                padding: '0 12px',
                borderRadius: '10px',
                backgroundColor: '#f2f5fa',
                marginBottom: '10px',
              }}
            />
            <View style={{ display: 'flex', gap: '8px' }}>
              <View style={{ flex: 1 }}>
                <Picker
                  mode="selector"
                  disabled={Boolean(pendingInput) || pendingBlocked}
                  value={repeatCount - 1}
                  range={[1, 2, 3, 4, 5].map(String)}
                  onChange={(event) => setRepeatCount(Number(event.detail.value) + 1)}
                >
                  <View
                    style={{
                      minHeight: '48px',
                      padding: '12px',
                      borderRadius: '10px',
                      backgroundColor: '#f2f5fa',
                    }}
                  >
                    <Text>播报 {repeatCount} 次 ›</Text>
                  </View>
                </Picker>
              </View>
              <View style={{ flex: 1 }}>
                <Picker
                  mode="selector"
                  disabled={Boolean(pendingInput) || pendingBlocked}
                  value={durationSeconds - 10}
                  range={Array.from({ length: 171 }, (_, index) => String(index + 10))}
                  onChange={(event) => setDurationSeconds(Number(event.detail.value) + 10)}
                >
                  <View
                    style={{
                      minHeight: '48px',
                      padding: '12px',
                      borderRadius: '10px',
                      backgroundColor: '#f2f5fa',
                    }}
                  >
                    <Text>显示 {durationSeconds} 秒 ›</Text>
                  </View>
                </Picker>
              </View>
            </View>
            <Text
              style={{ display: 'block', color: '#76859a', fontSize: '12px', margin: '8px 0 12px' }}
            >
              最短 {minimumSeconds} 秒
            </Text>
            {pendingInput ? (
              <View>
                <Text style={{ display: 'block', color: '#a45b00', marginBottom: '8px' }}>
                  {pendingLookupOnly ? '仅保留核查编号，禁止重试' : '发送结果待确认'}
                </Text>
                <View style={{ display: 'flex', gap: '8px' }}>
                  <View style={{ flex: 1 }}>
                    <SecondaryButton onClick={checkPendingAnnouncement} disabled={submitting}>
                      查询原请求
                    </SecondaryButton>
                  </View>
                  {!pendingLookupOnly && (
                    <View style={{ flex: 1 }}>
                      <PrimaryButton disabled={submitting} onClick={() => void send(pendingInput)}>
                        {submitting ? '发送中…' : '重试同一请求'}
                      </PrimaryButton>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <PrimaryButton
                disabled={Boolean(validation) || submitting || pendingBlocked}
                onClick={sendAnnouncement}
              >
                {submitting ? '发送中…' : '发送喊话'}
              </PrimaryButton>
            )}
          </Card>

          <Card>
            <View
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <SectionTitle>喊话回执</SectionTitle>
              <Text
                onClick={() => void refreshAnnouncements(classId)}
                style={{ padding: '8px', color: '#1769e0' }}
              >
                刷新
              </Text>
            </View>
            {active.map((item) => (
              <View key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid #edf0f5' }}>
                <Text style={{ display: 'block', fontWeight: '700' }}>{item.text}</Text>
                <Text
                  style={{ display: 'block', color: '#1769e0', fontSize: '13px', marginTop: '4px' }}
                >
                  {statusLabel(item.status)}
                </Text>
                {item.deliveries.map((delivery) => (
                  <Text
                    key={delivery.deviceId}
                    style={{
                      display: 'block',
                      color: '#8491a4',
                      fontSize: '12px',
                      marginTop: '4px',
                    }}
                  >
                    {delivery.isPrimary ? '主大屏' : '大屏'} ·{' '}
                    {delivery.displayedAt ? '已展示' : '等待展示'} ·{' '}
                    {delivery.soundStatus === 'FAILED'
                      ? '声音失败'
                      : delivery.soundStatus === 'COMPLETED'
                        ? `已播报 ${delivery.playedCount} 次`
                        : delivery.soundStatus === 'INTERRUPTED'
                          ? '播报中断'
                          : '播报状态待更新'}
                  </Text>
                ))}
                {item.reply && (
                  <Text style={{ display: 'block', marginTop: '8px', color: '#225f42' }}>
                    回复：{item.reply.text}
                  </Text>
                )}
                {item.teacherId === session?.teacher.id && (
                  <View style={{ marginTop: '8px' }}>
                    <SecondaryButton onClick={() => void finishAnnouncement(item)}>
                      结束喊话
                    </SecondaryButton>
                  </View>
                )}
              </View>
            ))}
            {active.length === 0 && (
              <Text style={{ display: 'block', color: '#8793a4' }}>暂无进行中的喊话</Text>
            )}
          </Card>

          <Card>
            <SectionTitle>最近记录</SectionTitle>
            {announcements
              .filter((item) => !active.includes(item))
              .slice(0, 10)
              .map((item) => (
                <View
                  key={item.id}
                  style={{ padding: '10px 0', borderBottom: '1px solid #edf0f5' }}
                >
                  <Text style={{ display: 'block' }}>{item.text}</Text>
                  <Text
                    style={{
                      display: 'block',
                      color: '#8793a4',
                      fontSize: '12px',
                      marginTop: '4px',
                    }}
                  >
                    {statusLabel(item.status)} · {new Date(item.sentAt).toLocaleString()}
                  </Text>
                  {item.reply && (
                    <Text style={{ display: 'block', color: '#225f42', marginTop: '4px' }}>
                      回复：{item.reply.text}
                    </Text>
                  )}
                </View>
              ))}
          </Card>
        </>
      )}
    </View>
  );
}
