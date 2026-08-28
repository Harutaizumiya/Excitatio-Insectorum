import { StudentStatus } from '@prisma/client';
import { ClassEventType } from '../common';
import { RandomPickService } from './random-pick.service';

describe('RandomPickService', () => {
  function setup(candidates: Array<{ id: string; name: string }>) {
    const prisma = {
      student: { findMany: jest.fn().mockResolvedValue(candidates) },
    };
    const realtime = { publishClassEvent: jest.fn() };
    const service = new RandomPickService(prisma as never, realtime as never);
    return { service, prisma, realtime };
  }

  it('queries only ACTIVE non-excluded students and publishes an 8000ms event', async () => {
    const { service, prisma, realtime } = setup([{ id: 'student-2', name: '乙' }]);
    await expect(service.pick('class-1', ['student-1', 'student-1'])).resolves.toEqual({
      student: { id: 'student-2', name: '乙' },
    });
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classId: 'class-1',
          status: StudentStatus.ACTIVE,
          id: { notIn: ['student-1'] },
        },
      }),
    );
    expect(realtime.publishClassEvent).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({
        type: ClassEventType.RANDOM_PICKED,
        classId: 'class-1',
        payload: {
          studentId: 'student-2',
          name: '乙',
          displayDurationMs: 8000,
        },
      }),
    );
  });

  it('returns a stable error when exclusions leave no candidate', async () => {
    const { service, realtime } = setup([]);
    await expect(service.pick('class-1', ['student-1'])).rejects.toMatchObject({
      code: 'RANDOM_PICK_NO_CANDIDATES',
    });
    expect(realtime.publishClassEvent).not.toHaveBeenCalled();
  });

  it('still returns the selected student when realtime publication fails', async () => {
    const { service, realtime } = setup([{ id: 'student-1', name: '甲' }]);
    realtime.publishClassEvent.mockImplementation(() => {
      throw new Error('socket unavailable');
    });
    await expect(service.pick('class-1')).resolves.toEqual({
      student: { id: 'student-1', name: '甲' },
    });
  });
});
