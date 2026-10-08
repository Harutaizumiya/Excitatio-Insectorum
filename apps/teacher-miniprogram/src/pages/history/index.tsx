import { useMemo, useRef, useState } from 'react';
import { Picker, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  getActiveClassId,
  getSession,
  listClassrooms,
  listScoreRecords,
  revertScoreRecord,
  setActiveClassId,
  type ClassroomSummary,
  type ScoreRecord,
} from '../../lib/api.ts';
import { Card, ErrorText, PageFrame, PrimaryButton, SecondaryButton } from '../../components/ui';
import { SCORE_EVENT_OPTIONS } from '../../features/score-events.ts';
import { useRealtimeEvent, useRealtimeLifecycle } from '../../lib/realtime';

const pageSize = 20;
type Filter = 'all' | 'mine' | 'reverted';

export default function HistoryPage() {
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [classId, setClassId] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<ScoreRecord[]>([]);
  const [detail, setDetail] = useState<ScoreRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState('');
  const nextServerPage = useRef(1);
  const serverPageCount = useRef(Number.POSITIVE_INFINITY);
  const loadVersion = useRef(0);
  const loadingRef = useRef(false);
  const classIdRef = useRef('');
  const teacherIdRef = useRef('');
  const revertLock = useRef(false);
  const session = getSession();
  const activeClass = classrooms.find((item) => item.id === classId) ?? null;
  const eventLabels = useMemo(
    () => new Map(SCORE_EVENT_OPTIONS.map((item) => [item.value, item.label])),
    [],
  );

  const fetchMore = async (targetClassId: string, targetFilter: Filter, reset: boolean) => {
    if (!targetClassId || (!reset && loadingRef.current)) return;
    const targetTeacherId = getSession()?.teacher.id;
    if (!targetTeacherId) {
      setRows([]);
      setDetail(null);
      void Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    loadingRef.current = true;
    const version = reset ? ++loadVersion.current : loadVersion.current;
    setLoading(true);
    setError('');
    const startAt = reset ? 1 : nextServerPage.current;
    let sourcePage = startAt;
    let collected = reset ? [] : rows;
    const wantedCount = collected.length + pageSize;
    try {
      while (collected.length < wantedCount && sourcePage <= serverPageCount.current) {
        if (!getSession()) {
          setRows([]);
          setDetail(null);
          setClassrooms([]);
          setClassId('');
          void Taro.redirectTo({ url: '/pages/login/index' });
          return;
        }
        if (version !== loadVersion.current || getSession()?.teacher.id !== targetTeacherId) return;
        const result = await listScoreRecords(targetClassId, {
          page: sourcePage,
          pageSize,
          ...(targetFilter === 'mine' ? { operatorId: targetTeacherId } : {}),
        });
        if (!getSession()) {
          setRows([]);
          setDetail(null);
          setClassrooms([]);
          setClassId('');
          void Taro.redirectTo({ url: '/pages/login/index' });
          return;
        }
        if (version !== loadVersion.current || getSession()?.teacher.id !== targetTeacherId) return;
        serverPageCount.current = Math.ceil(result.meta.total / pageSize);
        const pageRows =
          targetFilter === 'reverted'
            ? result.data.filter((record) => record.reverted || record.recordType === 'REVERT')
            : result.data;
        collected = [...collected, ...pageRows];
        sourcePage += 1;
        if (result.data.length === 0) break;
      }
      nextServerPage.current = sourcePage;
      setRows(collected);
    } catch (reason) {
      if (!getSession()) {
        setRows([]);
        setDetail(null);
        setClassrooms([]);
        setClassId('');
        void Taro.redirectTo({ url: '/pages/login/index' });
      } else if (version === loadVersion.current) {
        const statusCode =
          typeof reason === 'object' && reason !== null && 'statusCode' in reason
            ? Number((reason as { statusCode: unknown }).statusCode)
            : null;
        if (statusCode === 403) {
          setRows([]);
          setDetail(null);
          setError('无权访问此班级，请刷新班级列表或联系班主任');
        } else {
          setError(reason instanceof Error ? reason.message : '记录加载失败');
        }
      }
    } finally {
      if (version === loadVersion.current && getSession()?.teacher.id === targetTeacherId) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  };

  const load = async () => {
    const session = getSession();
    if (!session) {
      setRows([]);
      setDetail(null);
      setClassrooms([]);
      setClassId('');
      await Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    if (teacherIdRef.current && teacherIdRef.current !== session.teacher.id) {
      loadVersion.current += 1;
      loadingRef.current = false;
      classIdRef.current = '';
      setActiveClassId(null);
      setClassrooms([]);
      setClassId('');
      setRows([]);
      setDetail(null);
      setLoading(false);
      setError('');
    }
    teacherIdRef.current = session.teacher.id;
    const loadId = ++loadVersion.current;
    loadingRef.current = false;
    setLoading(false);
    try {
      const available = await listClassrooms();
      if (loadId !== loadVersion.current || getSession()?.teacher.id !== session.teacher.id) return;
      setClassrooms(available);
      const savedId = getActiveClassId();
      const selected = available.find((item) => item.id === savedId) ?? available[0] ?? null;
      if (!selected) {
        classIdRef.current = '';
        setClassId('');
        setRows([]);
        setDetail(null);
        return;
      }
      if (savedId !== selected.id) setActiveClassId(selected.id);
      classIdRef.current = selected.id;
      setClassId(selected.id);
      nextServerPage.current = 1;
      serverPageCount.current = Number.POSITIVE_INFINITY;
      await fetchMore(selected.id, filter, true);
    } catch (reason) {
      if (!getSession()) {
        setRows([]);
        setDetail(null);
        setClassrooms([]);
        setClassId('');
        void Taro.redirectTo({ url: '/pages/login/index' });
      } else if (
        loadId === loadVersion.current &&
        getSession()?.teacher.id === session.teacher.id
      ) {
        setError(reason instanceof Error ? reason.message : '记录加载失败');
      }
    }
  };

  useDidShow(() => {
    void load();
  });

  useRealtimeLifecycle(classId || null, () => {
    void load();
  });

  const refreshCurrentFilter = (eventClassId: string) => {
    if (eventClassId !== classIdRef.current) return;
    setDetail(null);
    setRows([]);
    nextServerPage.current = 1;
    serverPageCount.current = Number.POSITIVE_INFINITY;
    void fetchMore(eventClassId, filter, true);
  };
  useRealtimeEvent('SCORE_CHANGED', (event) => refreshCurrentFilter(event.classId));
  useRealtimeEvent('SCORE_REVERTED', (event) => refreshCurrentFilter(event.classId));

  const changeFilter = (nextFilter: Filter) => {
    if (nextFilter === filter) return;
    setFilter(nextFilter);
    setDetail(null);
    nextServerPage.current = 1;
    serverPageCount.current = Number.POSITIVE_INFINITY;
    setRows([]);
    void fetchMore(classId, nextFilter, true);
  };

  const changeClass = (nextClassId: string) => {
    if (nextClassId === classId) return;
    setActiveClassId(nextClassId);
    classIdRef.current = nextClassId;
    setClassId(nextClassId);
    setDetail(null);
    setRows([]);
    nextServerPage.current = 1;
    serverPageCount.current = Number.POSITIVE_INFINITY;
    void fetchMore(nextClassId, filter, true);
  };

  const canRevert = (record: ScoreRecord) =>
    Boolean(activeClass?.role === 'HEAD_TEACHER' || record.operator.id === session?.teacher.id) &&
    record.recordType === 'NORMAL' &&
    !record.reverted;

  const confirmRevert = async () => {
    if (!detail || !canRevert(detail) || reverting || revertLock.current || !classId) return;
    revertLock.current = true;
    const targetClassId = classId;
    const targetTeacherId = getSession()?.teacher.id;
    if (!targetTeacherId) {
      revertLock.current = false;
      await Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    const targetRecordId = detail.id;
    const targetVersion = loadVersion.current;
    const result = await Taro.showModal({
      title: '撤销积分',
      content: `撤销 ${detail.student.name} 的 ${detail.delta > 0 ? '+' : ''}${detail.delta} 分？`,
      confirmText: '确认撤销',
    });
    if (
      !result.confirm ||
      detail?.id !== targetRecordId ||
      classIdRef.current !== targetClassId ||
      loadVersion.current !== targetVersion ||
      getSession()?.teacher.id !== targetTeacherId
    ) {
      revertLock.current = false;
      return;
    }
    setReverting(true);
    setError('');
    let shouldReload = false;
    try {
      const reverted = await revertScoreRecord(targetClassId, targetRecordId);
      if (
        classIdRef.current !== targetClassId ||
        loadVersion.current !== targetVersion ||
        getSession()?.teacher.id !== targetTeacherId
      )
        return;
      const updated = { ...detail, reverted: true };
      setRows((current) => {
        const next = current.map((row) => (row.id === detail.id ? updated : row));
        if (filter === 'reverted' && !next.some((row) => row.id === reverted.id))
          next.push(reverted);
        return next;
      });
      setDetail(updated);
      shouldReload = true;
      Taro.showToast({ title: '已撤销', icon: 'success' });
    } catch (reason) {
      if (!getSession()) {
        setRows([]);
        setDetail(null);
        setClassrooms([]);
        setClassId('');
        void Taro.redirectTo({ url: '/pages/login/index' });
      } else if (
        classIdRef.current === targetClassId &&
        loadVersion.current === targetVersion &&
        getSession()?.teacher.id === targetTeacherId
      ) {
        setError(reason instanceof Error ? reason.message : '撤销失败');
      }
    } finally {
      revertLock.current = false;
      if (
        classIdRef.current === targetClassId &&
        loadVersion.current === targetVersion &&
        getSession()?.teacher.id === targetTeacherId
      ) {
        setReverting(false);
        if (shouldReload) void fetchMore(targetClassId, filter, true);
      }
    }
  };

  const classIndex = Math.max(
    0,
    classrooms.findIndex((item) => item.id === classId),
  );
  const canLoadMore = nextServerPage.current <= serverPageCount.current;

  return (
    <PageFrame title="积分记录" active="history">
      {classrooms.length > 1 && (
        <Picker
          mode="selector"
          range={classrooms.map((item) => item.name)}
          value={classIndex}
          onChange={(event) => {
            const selected = classrooms[Number(event.detail.value)];
            if (selected) changeClass(selected.id);
          }}
        >
          <Card>
            <Text>{activeClass?.name ?? '选择班级'} ›</Text>
          </Card>
        </Picker>
      )}
      <View style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {(
          [
            ['all', '全部'],
            ['mine', '本人'],
            ['reverted', '已撤销'],
          ] as const
        ).map(([id, label]) => (
          <View key={id} style={{ flex: 1 }}>
            {filter === id ? (
              <PrimaryButton onClick={() => changeFilter(id)}>{label}</PrimaryButton>
            ) : (
              <SecondaryButton onClick={() => changeFilter(id)}>{label}</SecondaryButton>
            )}
          </View>
        ))}
      </View>
      <ErrorText>{error}</ErrorText>
      {rows.map((record) => (
        <Card key={record.id}>
          <View
            onClick={() => setDetail(record)}
            style={{ minHeight: '64px', display: 'flex', alignItems: 'center' }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ display: 'block', fontWeight: '700' }}>
                {record.student.name} ·{' '}
                {record.event
                  ? (eventLabels.get(record.event.type) ?? '事件积分')
                  : (record.rule?.name ?? '积分记录')}
              </Text>
              <Text
                style={{ display: 'block', color: '#8190a4', fontSize: '12px', marginTop: '5px' }}
              >
                {new Date(record.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text
              style={{
                color: record.delta < 0 ? '#bd3b35' : '#15834d',
                fontSize: '19px',
                fontWeight: '700',
              }}
            >
              {record.delta > 0 ? '+' : ''}
              {record.delta}
            </Text>
          </View>
          {(record.reverted || record.recordType === 'REVERT') && (
            <Text style={{ color: '#8995a5', fontSize: '12px' }}>已撤销</Text>
          )}
        </Card>
      ))}
      {!loading && rows.length === 0 && (
        <Card>
          <Text style={{ color: '#8793a4' }}>暂无记录</Text>
        </Card>
      )}
      {loading && (
        <Text style={{ display: 'block', textAlign: 'center', color: '#7b899c', padding: '12px' }}>
          加载中…
        </Text>
      )}
      {!loading && canLoadMore && (
        <PrimaryButton onClick={() => void fetchMore(classId, filter, false)}>
          加载更多
        </PrimaryButton>
      )}

      {detail && (
        <View
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            backgroundColor: 'rgba(16,31,51,.45)',
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <View
            style={{
              width: '100%',
              backgroundColor: '#fff',
              borderRadius: '18px 18px 0 0',
              padding: '20px 18px calc(env(safe-area-inset-bottom) + 18px)',
            }}
          >
            <View
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
              }}
            >
              <Text style={{ fontSize: '18px', fontWeight: '700' }}>记录详情</Text>
              <Text
                onClick={() => setDetail(null)}
                style={{ padding: '8px 12px', color: '#586980' }}
              >
                关闭
              </Text>
            </View>
            <Text style={{ display: 'block', marginBottom: '8px' }}>
              {detail.student.name} · {detail.delta > 0 ? '+' : ''}
              {detail.delta} 分
            </Text>
            <Text style={{ display: 'block', marginBottom: '8px', color: '#586980' }}>
              事件：
              {detail.event
                ? (eventLabels.get(detail.event.type) ?? detail.event.type)
                : (detail.rule?.name ?? '自定义积分')}
            </Text>
            <Text style={{ display: 'block', marginBottom: '8px', color: '#586980' }}>
              登记人：{detail.operator.name}
            </Text>
            <Text style={{ display: 'block', marginBottom: '8px', color: '#586980' }}>
              学科：{detail.subject ?? '—'}
            </Text>
            <Text style={{ display: 'block', marginBottom: '8px', color: '#586980' }}>
              原因：{detail.reason || '—'}
            </Text>
            <Text
              style={{ display: 'block', marginBottom: '14px', color: '#8793a4', fontSize: '13px' }}
            >
              {new Date(detail.createdAt).toLocaleString()}
            </Text>
            {canRevert(detail) && (
              <PrimaryButton disabled={reverting} onClick={() => void confirmRevert()}>
                {reverting ? '撤销中…' : '撤销积分'}
              </PrimaryButton>
            )}
          </View>
        </View>
      )}
    </PageFrame>
  );
}
