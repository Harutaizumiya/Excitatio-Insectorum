import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBusinessKey,
  MANUAL_SCORE_EVENT_TYPES,
  SCORE_EVENT_OPTIONS,
  toCreateScoreEventInput,
  validateScoreEventDraft,
  type ScoreEventDraft,
} from './score-events.ts';

function draft(overrides: Partial<ScoreEventDraft> = {}): ScoreEventDraft {
  return {
    type: 'LATE',
    studentIds: ['student-1'],
    minutesLate: '1',
    rank: '',
    manualDelta: '',
    isOrganizer: false,
    specialContribution: false,
    reason: '',
    ...overrides,
  };
}

test('只提供19种教师可提交事件并排除系统奖励', () => {
  assert.equal(SCORE_EVENT_OPTIONS.length, 19);
  assert.equal(
    SCORE_EVENT_OPTIONS.some(({ value }) => value === 'NO_VIOLATION_REWARD'),
    false,
  );
  assert.equal(
    SCORE_EVENT_OPTIONS.some(({ value }) => value === 'COMMITTEE_REWARD'),
    false,
  );
});

test('沿用服务端字段边界校验并只发送当前事件参数', () => {
  assert.equal(validateScoreEventDraft(draft({ minutesLate: '0' })), '迟到分钟数必须为正整数');
  assert.equal(
    validateScoreEventDraft(draft({ type: 'EXAM_GRADE_TOP10', rank: '11' })),
    '名次须为 1-10 的整数',
  );
  assert.equal(
    validateScoreEventDraft(draft({ type: 'SPORTS_FINAL_TOP8', rank: '9' })),
    '名次须为 1-8 的整数',
  );
  assert.equal(
    validateScoreEventDraft(draft({ type: 'HOMEWORK_MISSING', manualDelta: '0', reason: '未交' })),
    '最终分值须为非 0 整数',
  );
  assert.equal(
    validateScoreEventDraft(draft({ type: 'MANUAL', manualDelta: '-2', reason: '  ' })),
    '请填写原因',
  );
  assert.deepEqual(
    toCreateScoreEventInput(
      draft({ type: 'HOMEWORK_MISSING', manualDelta: '-2', reason: '未交作业' }),
      'key',
    ),
    {
      type: 'HOMEWORK_MISSING',
      studentIds: ['student-1'],
      businessKey: 'key',
      manualDelta: -2,
      reason: '未交作业',
    },
  );
  assert.equal(MANUAL_SCORE_EVENT_TYPES.has('COMMITTEE_REWARD'), false);
});

test('business key 在同次写入重试期间可保留且不同操作可区分', () => {
  assert.equal(createBusinessKey('class-1', 10, 0.5), createBusinessKey('class-1', 10, 0.5));
  assert.notEqual(createBusinessKey('class-1', 10, 0.5), createBusinessKey('class-1', 11, 0.5));
});
