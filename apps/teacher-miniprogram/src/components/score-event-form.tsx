import { useMemo, useState } from 'react';
import { Input, Picker, Text, View } from '@tarojs/components';
import type { ScoreEventType, Student } from '../lib/api.ts';
import {
  SCORE_EVENT_OPTIONS,
  validateScoreEventDraft,
  type ScoreEventDraft,
} from '../features/score-events.ts';
import { ErrorText, PrimaryButton, SecondaryButton, SectionTitle } from './ui';

export function ScoreEventForm({
  students,
  initialStudentIds,
  submitting,
  pending,
  pendingBlocked = false,
  pendingLookupOnly = false,
  onClose,
  onSubmit,
  onCheckPending,
  onRetryPending,
}: {
  students: Student[];
  initialStudentIds: string[];
  submitting: boolean;
  pending: boolean;
  pendingBlocked?: boolean;
  pendingLookupOnly?: boolean;
  onClose: () => void;
  onSubmit: (draft: ScoreEventDraft) => void;
  onCheckPending: () => void;
  onRetryPending: () => void;
}) {
  const [draft, setDraft] = useState<ScoreEventDraft>(() => ({
    type: 'LATE',
    studentIds: initialStudentIds,
    minutesLate: '',
    rank: '',
    manualDelta: '',
    isOrganizer: false,
    specialContribution: false,
    reason: '',
  }));
  const [manualSign, setManualSign] = useState<'+' | '-'>('+');
  const validation = useMemo(() => validateScoreEventDraft(draft), [draft]);
  const selectedType =
    SCORE_EVENT_OPTIONS.find((item) => item.value === draft.type)?.label ?? '事件';

  const changeType = (type: ScoreEventType) => setDraft((current) => ({ ...current, type }));
  const toggleStudent = (studentId: string) => {
    setDraft((current) => ({
      ...current,
      studentIds: current.studentIds.includes(studentId)
        ? current.studentIds.filter((id) => id !== studentId)
        : [...current.studentIds, studentId],
    }));
  };

  if (pending) {
    return (
      <View>
        <SectionTitle>登记待确认</SectionTitle>
        <Text style={{ display: 'block', marginBottom: '12px', color: '#56667d' }}>
          {pendingBlocked
            ? '待确认记录无法确认所属账号，不能安全核查或重试，请联系班主任核对。'
            : pendingLookupOnly
              ? '此记录仅保留核查编号，未查到时不可重试，请联系班主任确认。'
              : '请先查询服务端结果，再决定是否重试。'}
        </Text>
        {!pendingBlocked && (
          <View style={{ display: 'flex', gap: '8px' }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton onClick={onCheckPending}>查询结果</PrimaryButton>
            </View>
            {!pendingLookupOnly && (
              <View style={{ flex: 1 }}>
                <SecondaryButton onClick={onRetryPending}>重试同一登记</SecondaryButton>
              </View>
            )}
          </View>
        )}
        <View style={{ marginTop: '8px' }}>
          <SecondaryButton onClick={onClose}>返回课堂</SecondaryButton>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionTitle>登记积分事件</SectionTitle>
        <Text onClick={onClose} style={{ padding: '8px', color: '#52647d' }}>
          关闭
        </Text>
      </View>
      <Picker
        mode="selector"
        range={SCORE_EVENT_OPTIONS.map((item) => item.label)}
        onChange={(event) => changeType(SCORE_EVENT_OPTIONS[Number(event.detail.value)]!.value)}
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
          <Text>{selectedType} ›</Text>
        </View>
      </Picker>

      <Text style={{ display: 'block', marginBottom: '6px', color: '#56667d' }}>
        学生 · {draft.studentIds.length}
      </Text>
      <View style={{ display: 'flex', flexWrap: 'wrap', marginBottom: '8px' }}>
        {students.map((student) => {
          const selected = draft.studentIds.includes(student.id);
          return (
            <Text
              key={student.id}
              onClick={() => toggleStudent(student.id)}
              style={{
                padding: '12px 10px',
                margin: '0 6px 6px 0',
                borderRadius: '9px',
                backgroundColor: selected ? '#dceaff' : '#f2f5fa',
                color: selected ? '#1558b0' : '#45566d',
                minHeight: '44px',
                minWidth: '44px',
                lineHeight: '20px',
                textAlign: 'center',
              }}
            >
              {selected ? '✓ ' : ''}
              {student.name}
              {student.studentNo ? ` · ${student.studentNo}` : ''}
            </Text>
          );
        })}
      </View>

      {draft.type === 'LATE' && (
        <Input
          type="number"
          value={draft.minutesLate}
          onInput={(event) =>
            setDraft((current) => ({ ...current, minutesLate: event.detail.value }))
          }
          placeholder="迟到分钟"
          style={{
            minHeight: '48px',
            padding: '0 12px',
            backgroundColor: '#f2f5fa',
            borderRadius: '10px',
            marginBottom: '10px',
          }}
        />
      )}
      {[
        'NOISIEST_CLASS_TOP3',
        'EXAM_GRADE_TOP10',
        'SUBJECT_TOP3',
        'BLACKBOARD',
        'INDIVIDUAL_ACTIVITY',
        'SPORTS_FINAL_TOP8',
        'GROUP_ACTIVITY',
      ].includes(draft.type) && (
        <Input
          type="number"
          value={draft.rank}
          onInput={(event) => setDraft((current) => ({ ...current, rank: event.detail.value }))}
          placeholder={`名次（1-${draft.type === 'EXAM_GRADE_TOP10' ? 10 : draft.type === 'SPORTS_FINAL_TOP8' ? 8 : 3}）`}
          style={{
            minHeight: '48px',
            padding: '0 12px',
            backgroundColor: '#f2f5fa',
            borderRadius: '10px',
            marginBottom: '10px',
          }}
        />
      )}
      {[
        'HOMEWORK_MISSING',
        'HOMEWORK_PRAISE',
        'BREAKTHROUGH',
        'PROGRESS',
        'DUTY_HYGIENE',
        'DORM_HYGIENE',
        'MANUAL',
      ].includes(draft.type) && (
        <View style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <View style={{ flex: 1 }}>
            <Picker
              mode="selector"
              range={['加分', '扣分']}
              value={manualSign === '+' ? 0 : 1}
              onChange={(event) => setManualSign(Number(event.detail.value) === 0 ? '+' : '-')}
            >
              <View
                style={{
                  minHeight: '48px',
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: '#f2f5fa',
                }}
              >
                <Text>{manualSign === '+' ? '加分' : '扣分'} ›</Text>
              </View>
            </Picker>
          </View>
          <View style={{ flex: 2 }}>
            <Input
              type="digit"
              value={draft.manualDelta}
              onInput={(event) =>
                setDraft((current) => ({
                  ...current,
                  manualDelta: event.detail.value.replace(/[^0-9]/g, ''),
                }))
              }
              placeholder="最终分值"
              style={{
                minHeight: '48px',
                padding: '0 12px',
                backgroundColor: '#f2f5fa',
                borderRadius: '10px',
              }}
            />
          </View>
        </View>
      )}
      {draft.type === 'GROUP_ACTIVITY' && (
        <View style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <View style={{ flex: 1 }}>
            <SecondaryButton
              onClick={() =>
                setDraft((current) => ({ ...current, isOrganizer: !current.isOrganizer }))
              }
            >
              {draft.isOrganizer ? '✓ ' : ''}组织者
            </SecondaryButton>
          </View>
          <View style={{ flex: 1 }}>
            <SecondaryButton
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  specialContribution: !current.specialContribution,
                }))
              }
            >
              {draft.specialContribution ? '✓ ' : ''}特殊贡献
            </SecondaryButton>
          </View>
        </View>
      )}
      <Input
        value={draft.reason}
        maxlength={200}
        onInput={(event) => setDraft((current) => ({ ...current, reason: event.detail.value }))}
        placeholder={
          [
            'HOMEWORK_MISSING',
            'HOMEWORK_PRAISE',
            'BREAKTHROUGH',
            'PROGRESS',
            'DUTY_HYGIENE',
            'DORM_HYGIENE',
            'MANUAL',
          ].includes(draft.type)
            ? '原因'
            : '原因（选填）'
        }
        style={{
          minHeight: '48px',
          padding: '0 12px',
          backgroundColor: '#f2f5fa',
          borderRadius: '10px',
          marginBottom: '8px',
        }}
      />
      <ErrorText>{validation}</ErrorText>
      <PrimaryButton
        disabled={Boolean(validation) || submitting}
        onClick={() => {
          if (validation) return;
          onSubmit({
            ...draft,
            manualDelta: draft.manualDelta ? `${manualSign}${draft.manualDelta}` : '',
          });
        }}
      >
        {submitting ? '记录中…' : '记录'}
      </PrimaryButton>
    </View>
  );
}
