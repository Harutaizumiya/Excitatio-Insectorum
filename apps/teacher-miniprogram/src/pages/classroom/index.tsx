import { useMemo, useRef, useState } from 'react';
import { Input, Picker, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  createScoreEvent,
  getActiveClassId,
  getSession,
  getScoreEventByKey,
  getSeatLayout,
  listClassrooms,
  listStudents,
  randomPick,
  setActiveClassId,
  type ClassroomSummary,
  type CreateScoreEventInput,
  type SeatLayout,
  type Student,
} from '../../lib/api.ts';
import { ScoreEventForm } from '../../components/score-event-form';
import {
  Card,
  ErrorText,
  PageFrame,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
} from '../../components/ui';
import {
  createBusinessKey,
  toCreateScoreEventInput,
  type ScoreEventDraft,
} from '../../features/score-events.ts';
import {
  hasPendingWrite,
  isOwnedPendingWrite,
  ownedPendingWrite,
} from '../../features/pending-write.ts';
import { loadAllStudents, studentSeatLabel } from '../../features/students.ts';
import { useRealtimeEvent, useRealtimeLifecycle, useRealtimeStatus } from '../../lib/realtime';

const pageSize = 100;
const pendingScoreKey = (targetClassId: string, teacherId: string) =>
  `teacher-miniprogram:pending-score:${encodeURIComponent(teacherId)}:${encodeURIComponent(targetClassId)}`;
const legacyPendingScoreKey = (targetClassId: string) =>
  `teacher-miniprogram:pending-score:${targetClassId}`;

export default function ClassroomPage() {
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [layout, setLayout] = useState<SeatLayout | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [classLoading, setClassLoading] = useState(false);
  const [error, setError] = useState('');
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreSubmitting, setScoreSubmitting] = useState(false);
  const [pendingScore, setPendingScore] = useState<CreateScoreEventInput | null>(null);
  const [pendingScoreBlocked, setPendingScoreBlocked] = useState(false);
  const [pendingScoreLookupOnly, setPendingScoreLookupOnly] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [pickLoading, setPickLoading] = useState(false);
  const [pickHint, setPickHint] = useState('');
  const [pickError, setPickError] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const requestVersion = useRef(0);
  const classIdRef = useRef('');
  const teacherIdRef = useRef('');
  const classEpoch = useRef(0);
  const scoreLock = useRef(false);
  const pickLock = useRef(false);

  const activeClass = classrooms.find((item) => item.id === classId) ?? null;
  const teacherName = getSession()?.teacher.name ?? '';
  const filteredStudents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      `${student.name} ${student.studentNo ?? ''}`.toLocaleLowerCase().includes(query),
    );
  }, [students, search]);
  const realtimeStatus = useRealtimeStatus();

  const loadClassData = async (targetClassId: string) => {
    if (!targetClassId) return;
    const targetTeacherId = getSession()?.teacher.id;
    if (!targetTeacherId) return;
    const version = ++requestVersion.current;
    const isCurrent = () =>
      version === requestVersion.current && getSession()?.teacher.id === targetTeacherId;
    setClassLoading(true);
    setError('');
    try {
      const [allStudents, seatLayout] = await Promise.all([
        loadAllStudents(targetClassId, listStudents, pageSize, isCurrent),
        getSeatLayout(targetClassId),
      ]);
      if (!getSession()) {
        setStudents([]);
        setLayout(null);
        setSelectedIds([]);
        setPendingScore(null);
        setPendingScoreLookupOnly(false);
        setPicked(null);
        void Taro.redirectTo({ url: '/pages/login/index' });
        return;
      }
      if (!isCurrent()) return;
      setStudents(
        allStudents.filter((student: Student) => student.status === 'ACTIVE' && !student.deletedAt),
      );
      setLayout(seatLayout);
    } catch (reason) {
      if (!getSession()) {
        setStudents([]);
        setLayout(null);
        setSelectedIds([]);
        setPendingScore(null);
        setPendingScoreBlocked(false);
        setPendingScoreLookupOnly(false);
        setPicked(null);
        setExcludedIds([]);
        void Taro.redirectTo({ url: '/pages/login/index' });
        return;
      }
      if (!isCurrent()) return;
      const statusCode =
        typeof reason === 'object' && reason !== null && 'statusCode' in reason
          ? Number((reason as { statusCode: unknown }).statusCode)
          : null;
      if (statusCode === 403) {
        setStudents([]);
        setLayout(null);
        setSelectedIds([]);
        setError('无权访问此班级，请刷新班级列表或联系班主任');
        return;
      }
      setStudents([]);
      setLayout(null);
      setError(reason instanceof Error ? reason.message : '课堂加载失败');
    } finally {
      if (isCurrent()) setClassLoading(false);
    }
  };

  const restorePendingScore = async (targetClassId: string) => {
    const teacherId = getSession()?.teacher.id;
    if (!teacherId) return;
    const stored = Taro.getStorageSync(pendingScoreKey(targetClassId, teacherId));
    if (!hasPendingWrite(stored)) {
      const legacy = Taro.getStorageSync(legacyPendingScoreKey(targetClassId));
      if (hasPendingWrite(legacy)) {
        setPendingScore(null);
        setPendingScoreBlocked(true);
        setPendingScoreLookupOnly(false);
        setScoreOpen(true);
        setPendingMessage('待确认记录无法确认所属账号，不能安全核查或重试，请联系班主任核对。');
      }
      return;
    }
    if (
      !isOwnedPendingWrite<CreateScoreEventInput>(stored, teacherId, targetClassId) ||
      typeof stored.input.businessKey !== 'string' ||
      !stored.input.businessKey.trim()
    ) {
      setPendingScore(null);
      setPendingScoreBlocked(true);
      setPendingScoreLookupOnly(false);
      setScoreOpen(true);
      setPendingMessage('待确认记录无法确认所属账号，不能安全核查或重试，请联系班主任核对。');
      return;
    }
    const input = stored.input;
    const lookupOnly = stored.lookupOnly === true;
    const businessKey = input.businessKey;
    if (typeof businessKey !== 'string' || !businessKey.trim()) return;
    const targetEpoch = classEpoch.current;
    const isCurrent = () =>
      classIdRef.current === targetClassId &&
      classEpoch.current === targetEpoch &&
      getSession()?.teacher.id === teacherId;
    setPendingScore(input);
    setPendingScoreBlocked(false);
    setPendingScoreLookupOnly(lookupOnly);
    setScoreOpen(true);
    setPendingMessage('正在核查登记结果…');
    try {
      await getScoreEventByKey(targetClassId, businessKey);
      Taro.removeStorageSync(pendingScoreKey(targetClassId, teacherId));
      if (!isCurrent()) return;
      setPendingScore(null);
      setPendingScoreBlocked(false);
      setPendingScoreLookupOnly(false);
      setScoreOpen(false);
      setSelectedIds([]);
      Taro.showToast({ title: '已记录', icon: 'success' });
    } catch (reason) {
      if (!getSession()) {
        setPendingScore(null);
        setPendingScoreLookupOnly(false);
        setStudents([]);
        setLayout(null);
        void Taro.redirectTo({ url: '/pages/login/index' });
      } else if (isCurrent()) {
        setPendingMessage(
          lookupOnly
            ? '未查到原登记；已禁止重试，请联系班主任确认。'
            : reason instanceof Error
              ? reason.message
              : '登记结果待确认',
        );
      }
    }
  };

  const load = async () => {
    const session = getSession();
    if (!session) {
      setClassrooms([]);
      setClassId('');
      setStudents([]);
      setLayout(null);
      setSelectedIds([]);
      setPendingScore(null);
      setPendingScoreBlocked(false);
      setPendingScoreLookupOnly(false);
      setPicked(null);
      setExcludedIds([]);
      await Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    if (teacherIdRef.current && teacherIdRef.current !== session.teacher.id) {
      requestVersion.current += 1;
      classEpoch.current += 1;
      classIdRef.current = '';
      setActiveClassId(null);
      setClassrooms([]);
      setClassId('');
      setStudents([]);
      setLayout(null);
      setSelectedIds([]);
      setSearch('');
      setScoreOpen(false);
      setPendingScore(null);
      setPendingScoreBlocked(false);
      setPendingScoreLookupOnly(false);
      setPendingMessage('');
      setPicked(null);
      setExcludedIds([]);
      setPickHint('');
      setPickError('');
    }
    teacherIdRef.current = session.teacher.id;
    setClassLoading(true);
    setError('');
    const expectedClassEpoch = classEpoch.current;
    const expectedTeacherId = session.teacher.id;
    try {
      const available = await listClassrooms();
      if (
        expectedClassEpoch !== classEpoch.current ||
        getSession()?.teacher.id !== expectedTeacherId
      )
        return;
      setClassrooms(available);
      const savedId = getActiveClassId();
      const current = available.find((item) => item.id === savedId) ?? available[0] ?? null;
      if (!current) {
        requestVersion.current += 1;
        classEpoch.current += 1;
        classIdRef.current = '';
        setActiveClassId(null);
        setClassId('');
        setStudents([]);
        setLayout(null);
        setSelectedIds([]);
        setPendingScore(null);
        setPendingScoreBlocked(false);
        setPendingScoreLookupOnly(false);
        setPendingMessage('');
        setPicked(null);
        setExcludedIds([]);
        setPickHint('');
        return;
      }
      if (current.id !== savedId) {
        setActiveClassId(current.id);
        classIdRef.current = current.id;
        classEpoch.current += 1;
      }
      if (current.id !== classId) {
        classIdRef.current = current.id;
        if (current.id === savedId) classEpoch.current += 1;
        setSelectedIds([]);
        setScoreOpen(false);
        setPendingScore(null);
        setPendingScoreBlocked(false);
        setPendingScoreLookupOnly(false);
        setPendingMessage('');
        setPicked(null);
        setExcludedIds([]);
      }
      setClassId(current.id);
      await loadClassData(current.id);
      await restorePendingScore(current.id);
    } catch (reason) {
      if (
        expectedClassEpoch === classEpoch.current &&
        getSession()?.teacher.id === expectedTeacherId
      )
        setError(reason instanceof Error ? reason.message : '课堂加载失败');
    } finally {
      if (getSession()?.teacher.id === expectedTeacherId) setClassLoading(false);
    }
  };

  useDidShow(() => {
    void load();
  });

  useRealtimeLifecycle(classId, () => {
    void load();
  });
  useRealtimeEvent('STUDENT_CHANGED', (event) => {
    if (event.classId === classIdRef.current) void loadClassData(event.classId);
  });
  useRealtimeEvent('SEAT_LAYOUT_CHANGED', (event) => {
    if (event.classId === classIdRef.current) void loadClassData(event.classId);
  });
  useRealtimeEvent('SCORE_CHANGED', (event) => {
    if (event.classId === classIdRef.current) void loadClassData(event.classId);
  });
  useRealtimeEvent('SCORE_REVERTED', (event) => {
    if (event.classId === classIdRef.current) void loadClassData(event.classId);
  });
  useRealtimeEvent('RANKING_CHANGED', (event) => {
    if (event.classId === classIdRef.current) void loadClassData(event.classId);
  });

  const switchClass = async (nextClassId: string) => {
    if (nextClassId === classId) return;
    if (scoreLock.current || pickLock.current) {
      Taro.showToast({ title: '操作完成后再切换', icon: 'none' });
      return;
    }
    const originClassId = classIdRef.current;
    const originEpoch = classEpoch.current;
    const originTeacherId = getSession()?.teacher.id;
    const dirty =
      selectedIds.length > 0 || scoreOpen || Boolean(pendingScore) || pendingScoreBlocked;
    if (dirty) {
      const result = await Taro.showModal({
        title: '切换班级',
        content: '切换后将清除学生选择和未提交内容；待确认登记会保留',
        confirmText: '继续切换',
      });
      if (
        !result.confirm ||
        classIdRef.current !== originClassId ||
        classEpoch.current !== originEpoch ||
        getSession()?.teacher.id !== originTeacherId
      )
        return;
      if (scoreLock.current || pickLock.current) {
        Taro.showToast({ title: '操作完成后再切换', icon: 'none' });
        return;
      }
    }
    requestVersion.current += 1;
    classIdRef.current = nextClassId;
    classEpoch.current += 1;
    setActiveClassId(nextClassId);
    setClassId(nextClassId);
    setSelectedIds([]);
    setScoreOpen(false);
    setPendingScore(null);
    setPendingScoreBlocked(false);
    setPendingScoreLookupOnly(false);
    setPendingMessage('');
    setPicked(null);
    setExcludedIds([]);
    setPickHint('');
    setSearch('');
    await loadClassData(nextClassId);
    await restorePendingScore(nextClassId);
  };

  const toggleStudent = (studentId: string) => {
    setSelectedIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  };

  const resolveScore = async (input: CreateScoreEventInput) => {
    if (!classIdRef.current || scoreLock.current) return;
    const targetTeacherId = getSession()?.teacher.id;
    if (!targetTeacherId) return;
    scoreLock.current = true;
    const targetClassId = classIdRef.current;
    const storageKey = pendingScoreKey(targetClassId, targetTeacherId);
    const targetEpoch = classEpoch.current;
    const isCurrent = () =>
      classIdRef.current === targetClassId &&
      classEpoch.current === targetEpoch &&
      getSession()?.teacher.id === targetTeacherId;
    setScoreSubmitting(true);
    setPendingMessage('');
    try {
      Taro.setStorageSync(storageKey, ownedPendingWrite(targetTeacherId, targetClassId, input));
      await createScoreEvent(targetClassId, input);
      Taro.removeStorageSync(storageKey);
      if (!isCurrent()) return;
      setPendingScore(null);
      setPendingScoreLookupOnly(false);
      setScoreOpen(false);
      setSelectedIds([]);
      Taro.showToast({ title: '已记录', icon: 'success' });
    } catch (reason) {
      if (!getSession()) {
        setStudents([]);
        setLayout(null);
        setSelectedIds([]);
        setPendingScore(null);
        setPendingScoreBlocked(false);
        setPendingScoreLookupOnly(false);
        void Taro.redirectTo({ url: '/pages/login/index' });
        return;
      }
      if (!isCurrent()) return;
      const statusCode =
        typeof reason === 'object' && reason !== null && 'statusCode' in reason
          ? Number((reason as { statusCode: unknown }).statusCode)
          : null;
      if (statusCode !== null && statusCode >= 400 && statusCode < 500 && statusCode !== 409) {
        Taro.removeStorageSync(storageKey);
        setPendingScore(null);
        setPendingScoreBlocked(false);
        setPendingScoreLookupOnly(false);
        if (statusCode === 403) {
          setStudents([]);
          setLayout(null);
          setSelectedIds([]);
          setError('无权访问此班级，请刷新班级列表或联系班主任');
        } else {
          setPendingMessage(reason instanceof Error ? reason.message : '登记失败');
        }
        return;
      }
      setPendingScore(input);
      try {
        await getScoreEventByKey(targetClassId, input.businessKey ?? '');
        Taro.removeStorageSync(storageKey);
        if (!isCurrent()) return;
        setPendingScore(null);
        setPendingScoreBlocked(false);
        setPendingScoreLookupOnly(false);
        setScoreOpen(false);
        setSelectedIds([]);
        Taro.showToast({ title: '已记录', icon: 'success' });
      } catch {
        if (isCurrent())
          setPendingMessage(reason instanceof Error ? reason.message : '登记结果待确认');
      }
    } finally {
      scoreLock.current = false;
      if (isCurrent()) setScoreSubmitting(false);
    }
  };

  const createScore = async (draft: ScoreEventDraft) => {
    if (!classId) return;
    const businessKey = createBusinessKey(classId);
    try {
      const input = toCreateScoreEventInput(draft, businessKey);
      await resolveScore(input);
    } catch (reason) {
      setPendingMessage(reason instanceof Error ? reason.message : '登记失败');
    }
  };

  const checkPendingScore = async () => {
    if (!pendingScore || pendingScoreBlocked || !classIdRef.current || scoreLock.current) return;
    const targetTeacherId = getSession()?.teacher.id;
    if (!targetTeacherId) return;
    scoreLock.current = true;
    const targetClassId = classIdRef.current;
    const storageKey = pendingScoreKey(targetClassId, targetTeacherId);
    const targetEpoch = classEpoch.current;
    const isCurrent = () =>
      classIdRef.current === targetClassId &&
      classEpoch.current === targetEpoch &&
      getSession()?.teacher.id === targetTeacherId;
    setScoreSubmitting(true);
    setPendingMessage('');
    try {
      await getScoreEventByKey(targetClassId, pendingScore.businessKey ?? '');
      Taro.removeStorageSync(storageKey);
      if (!isCurrent()) return;
      setPendingScore(null);
      setPendingScoreBlocked(false);
      setPendingScoreLookupOnly(false);
      setScoreOpen(false);
      setSelectedIds([]);
      Taro.showToast({ title: '已记录', icon: 'success' });
    } catch (reason) {
      if (!getSession()) {
        setStudents([]);
        setLayout(null);
        setPendingScore(null);
        setPendingScoreLookupOnly(false);
        void Taro.redirectTo({ url: '/pages/login/index' });
      } else if (isCurrent()) {
        setPendingMessage(reason instanceof Error ? reason.message : '暂未查到，请稍后再查');
      }
    } finally {
      scoreLock.current = false;
      if (isCurrent()) setScoreSubmitting(false);
    }
  };

  const retryPendingScore = async () => {
    if (!pendingScore || pendingScoreBlocked || pendingScoreLookupOnly) return;
    await resolveScore(pendingScore);
  };

  const runPick = async () => {
    if (!classIdRef.current || pickLock.current) return;
    const targetTeacherId = getSession()?.teacher.id;
    if (!targetTeacherId) {
      await Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    if (students.length === 0) {
      setPickError('没有可点名的学生');
      return;
    }
    pickLock.current = true;
    const targetClassId = classIdRef.current;
    const targetEpoch = classEpoch.current;
    const isCurrent = () =>
      classIdRef.current === targetClassId &&
      classEpoch.current === targetEpoch &&
      getSession()?.teacher.id === targetTeacherId;
    const studentIds = new Set(students.map((student) => student.id));
    const validExcluded = excludedIds.filter((id) => studentIds.has(id));
    const newRound = validExcluded.length >= students.length;
    const roundExcluded = newRound ? [] : validExcluded;
    setPickLoading(true);
    setPickError('');
    setPicked(null);
    setPickHint(newRound ? '新一轮点名中…' : '正在从未点名学生中抽取…');
    if (newRound) setExcludedIds([]);
    try {
      const result = await randomPick(targetClassId, { excludeStudentIds: roundExcluded });
      if (!isCurrent()) return;
      setPicked(result.student);
      setExcludedIds([...new Set([...roundExcluded, result.student.id])]);
      setPickHint('');
    } catch (reason) {
      if (!getSession()) {
        setStudents([]);
        setLayout(null);
        setSelectedIds([]);
        setPicked(null);
        void Taro.redirectTo({ url: '/pages/login/index' });
      } else if (isCurrent()) {
        const statusCode =
          typeof reason === 'object' && reason !== null && 'statusCode' in reason
            ? Number((reason as { statusCode: unknown }).statusCode)
            : null;
        if (statusCode === 403) {
          setStudents([]);
          setLayout(null);
          setSelectedIds([]);
          setPickError('无权访问此班级，请刷新班级列表或联系班主任');
          setPickHint('');
          return;
        }
        setPickError(reason instanceof Error ? reason.message : '点名失败');
        setPickHint('');
      }
    } finally {
      pickLock.current = false;
      if (isCurrent()) setPickLoading(false);
    }
  };

  const openAnnouncements = () => {
    if (classId)
      void Taro.navigateTo({
        url: `/pages/announcements/index?classId=${encodeURIComponent(classId)}`,
      });
  };

  return (
    <PageFrame title="课堂" active="classroom">
      {classrooms.length > 1 && (
        <Picker
          mode="selector"
          range={classrooms.map((item) => item.name)}
          value={Math.max(
            0,
            classrooms.findIndex((item) => item.id === classId),
          )}
          onChange={(event) => {
            const selected = classrooms[Number(event.detail.value)];
            if (selected) void switchClass(selected.id);
          }}
        >
          <Card>
            <Text style={{ display: 'block', fontWeight: '700' }}>
              {activeClass?.name ?? '选择班级'} ›
            </Text>
            <Text
              style={{ display: 'block', marginTop: '4px', color: '#8491a4', fontSize: '12px' }}
            >
              {teacherName}
            </Text>
          </Card>
        </Picker>
      )}
      {classrooms.length === 1 && (
        <Card>
          <Text style={{ display: 'block', fontWeight: '700' }}>
            {activeClass?.name ?? classrooms[0]?.name}
          </Text>
          <Text style={{ display: 'block', marginTop: '4px', color: '#8491a4', fontSize: '12px' }}>
            {teacherName}
          </Text>
        </Card>
      )}
      {classrooms.length === 0 && !classLoading && (
        <Card>
          <Text style={{ display: 'block', fontWeight: '700' }}>暂无可用班级</Text>
          <Text style={{ display: 'block', marginTop: '8px', color: '#62728a' }}>联系班主任</Text>
        </Card>
      )}
      {classLoading && <Text style={{ display: 'block', color: '#62728a' }}>加载中…</Text>}
      <ErrorText>{error}</ErrorText>

      {activeClass && !classLoading && (
        <>
          <Card>
            <View style={{ display: 'flex', gap: '8px' }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  onClick={() => setScoreOpen(true)}
                  disabled={!pendingScore && !pendingScoreBlocked && selectedIds.length === 0}
                >
                  {pendingScore || pendingScoreBlocked
                    ? '登记待确认'
                    : `记积分 · ${selectedIds.length}`}
                </PrimaryButton>
              </View>
              <View style={{ flex: 1 }}>
                <SecondaryButton onClick={openAnnouncements}>喊话</SecondaryButton>
              </View>
            </View>
            <Text
              style={{ display: 'block', marginTop: '8px', color: '#8491a4', fontSize: '12px' }}
            >
              {realtimeStatus === 'CONNECTED'
                ? '实时已连接'
                : realtimeStatus === 'CONNECTING'
                  ? '实时连接中'
                  : realtimeStatus === 'AUTH_REQUIRED'
                    ? '请重新登录'
                    : '实时未连接'}
            </Text>
          </Card>

          <Card>
            <View
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
              }}
            >
              <SectionTitle>点名</SectionTitle>
              <Text style={{ color: '#69788e', fontSize: '13px' }}>
                本轮 {excludedIds.length} 人
              </Text>
            </View>
            <View style={{ display: 'flex', gap: '8px' }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton disabled={pickLoading} onClick={() => void runPick()}>
                  {pickLoading ? '点名中…' : '随机点名'}
                </PrimaryButton>
              </View>
              <View style={{ flex: 1 }}>
                <SecondaryButton
                  disabled={pickLoading}
                  onClick={() => {
                    setExcludedIds([]);
                    setPicked(null);
                    setPickError('');
                    setPickHint('');
                  }}
                >
                  新一轮
                </SecondaryButton>
              </View>
            </View>
            {picked &&
              (students.some((student) => student.id === picked.id) ? (
                <View
                  onClick={() => {
                    setSelectedIds([picked.id]);
                    setScoreOpen(true);
                  }}
                  style={{
                    minHeight: '48px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    color: '#1769e0',
                  }}
                >
                  <Text style={{ fontSize: '23px', fontWeight: '700' }}>{picked.name}</Text>
                  <Text>选中记分 ›</Text>
                </View>
              ) : (
                <Text
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '14px 0 4px',
                    fontSize: '23px',
                    fontWeight: '700',
                    color: '#1769e0',
                  }}
                >
                  {picked.name}
                </Text>
              ))}
            {pickHint && (
              <Text
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '12px 0 4px',
                  color: '#62728a',
                }}
              >
                {pickHint}
              </Text>
            )}
            <ErrorText>{pickError}</ErrorText>
          </Card>

          {layout && layout.seats.length > 0 && (
            <Card>
              <SectionTitle>座位</SectionTitle>
              <View style={{ overflowX: 'auto' }}>
                <View
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    minWidth: `${Math.max(layout.cols, 1) * 44}px`,
                  }}
                >
                  {[...layout.seats]
                    .sort((a, b) => a.row - b.row || a.col - b.col)
                    .map((seat) => {
                      const student = seat.student
                        ? students.find((item) => item.id === seat.student?.id)
                        : null;
                      const selected = Boolean(student && selectedIds.includes(student.id));
                      const label =
                        seat.student?.name ??
                        (seat.cellType === 'podium'
                          ? '讲台'
                          : seat.cellType === 'aisle'
                            ? '过道'
                            : '空位');
                      return (
                        <View
                          key={`${seat.row}-${seat.col}`}
                          style={{
                            width: `${100 / Math.max(layout.cols, 1)}%`,
                            minWidth: '44px',
                            padding: '3px',
                            boxSizing: 'border-box',
                          }}
                        >
                          <View
                            onClick={() => student && toggleStudent(student.id)}
                            style={{
                              minHeight: '52px',
                              borderRadius: '8px',
                              backgroundColor: selected
                                ? '#1769e0'
                                : seat.cellType === 'seat'
                                  ? '#edf4ff'
                                  : '#f4f6f9',
                              color: selected ? '#fff' : student ? '#244266' : '#99a4b3',
                              textAlign: 'center',
                              padding: '5px 2px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ display: 'block', fontSize: '10px', opacity: '.75' }}>
                              {studentSeatLabel(seat.row, seat.col)}
                            </Text>
                            <Text
                              style={{ display: 'block', fontSize: '11px', overflow: 'hidden' }}
                            >
                              {label}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                </View>
              </View>
            </Card>
          )}

          <Card>
            <SectionTitle>学生 · {students.length}</SectionTitle>
            <Input
              value={search}
              onInput={(event) => setSearch(event.detail.value)}
              placeholder="搜索姓名或学号"
              style={{
                minHeight: '48px',
                padding: '0 12px',
                borderRadius: '10px',
                backgroundColor: '#f2f5fa',
                marginBottom: '8px',
              }}
            />
            {filteredStudents.map((student: Student) => {
              const selected = selectedIds.includes(student.id);
              return (
                <View
                  key={student.id}
                  onClick={() => toggleStudent(student.id)}
                  style={{
                    minHeight: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1px solid #edf0f5',
                    padding: '0 4px',
                  }}
                >
                  <Text
                    style={{
                      width: '28px',
                      color: selected ? '#1769e0' : '#8995a6',
                      fontSize: '18px',
                    }}
                  >
                    {selected ? '✓' : '○'}
                  </Text>
                  <Text style={{ flex: 1 }}>{student.name}</Text>
                  <Text style={{ color: '#8491a4', fontSize: '13px' }}>
                    {student.studentNo ?? ''}
                  </Text>
                </View>
              );
            })}
            {students.length === 0 && !classLoading && (
              <Text style={{ color: '#8290a4' }}>班级暂无学生</Text>
            )}
            {students.length > 0 && filteredStudents.length === 0 && (
              <Text style={{ color: '#8290a4' }}>没有匹配的学生</Text>
            )}
          </Card>

          <View style={{ marginBottom: '12px' }}>
            <SecondaryButton onClick={() => void loadClassData(classId)}>刷新课堂</SecondaryButton>
          </View>
        </>
      )}

      {scoreOpen && (
        <View
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10,
            backgroundColor: 'rgba(16,31,51,.45)',
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <View
            style={{
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              backgroundColor: '#fff',
              borderRadius: '18px 18px 0 0',
              padding: '18px 16px calc(env(safe-area-inset-bottom) + 20px)',
            }}
          >
            <ErrorText>{pendingMessage}</ErrorText>
            <ScoreEventForm
              students={students}
              initialStudentIds={selectedIds}
              submitting={scoreSubmitting}
              pending={Boolean(pendingScore) || pendingScoreBlocked}
              pendingBlocked={pendingScoreBlocked}
              pendingLookupOnly={pendingScoreLookupOnly}
              onClose={() => setScoreOpen(false)}
              onSubmit={(inputDraft) => void createScore(inputDraft)}
              onCheckPending={() => void checkPendingScore()}
              onRetryPending={() => void retryPendingScore()}
            />
          </View>
        </View>
      )}
    </PageFrame>
  );
}
