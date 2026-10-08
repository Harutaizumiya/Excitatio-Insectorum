import assert from 'node:assert/strict';
import test from 'node:test';
import { minimumAnnouncementSeconds, validateAnnouncement } from './announcements.ts';
import { hasPendingWrite, isOwnedPendingWrite, ownedPendingWrite } from './pending-write.ts';

test('喊话播放时长按服务端语速公式计算', () => {
  assert.equal(minimumAnnouncementSeconds('你好', 1), 4);
  assert.equal(minimumAnnouncementSeconds('你好', 3), 9);
});

test('喊话文案、次数、时长采用服务端边界', () => {
  assert.equal(validateAnnouncement(' ', 1, 10, 4), '喊话内容应为 1～100 字');
  assert.equal(validateAnnouncement('你好', 6, 10, 4), '播报次数须为 1～5 次');
  assert.equal(validateAnnouncement('你好', 1, 9, 4), '显示时间须为 10～180 秒');
  assert.equal(validateAnnouncement('你好', 1, 10, 11), '按预估语速至少需要 11 秒');
  assert.equal(validateAnnouncement('你好', 1, 10, 4), null);
});

test('待确认写入只对原教师和原班级开放', () => {
  assert.equal(hasPendingWrite(''), false);
  assert.equal(hasPendingWrite(undefined), false);
  assert.equal(hasPendingWrite(null), false);
  const pending = ownedPendingWrite('teacher-a', 'class-a', { idempotencyKey: 'stable-key' });
  assert.equal(isOwnedPendingWrite(pending, 'teacher-a', 'class-a'), true);
  assert.equal(isOwnedPendingWrite(pending, 'teacher-b', 'class-a'), false);
  assert.equal(isOwnedPendingWrite(pending, 'teacher-a', 'class-b'), false);
  assert.equal(
    isOwnedPendingWrite({ idempotencyKey: 'legacy-key' }, 'teacher-a', 'class-a'),
    false,
  );
  assert.equal(
    isOwnedPendingWrite(
      { teacherId: 'teacher-a', classId: 'class-a', input: null },
      'teacher-a',
      'class-a',
    ),
    false,
  );
});
