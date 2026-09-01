import { BusinessException } from '../common';
import { SchedulesService } from './schedules.service';

const periods = [
  { periodNo: 1, startTime: '08:00', endTime: '08:40' },
  { periodNo: 2, startTime: '08:50', endTime: '09:30' },
];

function validDto() {
  return {
    activeTemplateKey: 'standard',
    templates: [{ clientKey: 'standard', id: 'template-1', name: '标准作息', periods }],
    entries: [{ weekday: 3, periodNo: 1, courseName: '数学', classTeacherId: 'class-teacher-1' }],
  };
}

function setup() {
  const transaction = {
    classroom: {
      findUnique: jest.fn().mockResolvedValue({ id: 'class-1' }),
      update: jest.fn(),
    },
    scheduleTemplate: {
      findMany: jest.fn().mockResolvedValue([{ id: 'template-1' }, { id: 'template-2' }]),
      deleteMany: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'template-1' }),
      create: jest.fn().mockResolvedValue({ id: 'template-new' }),
    },
    scheduleTemplatePeriod: { deleteMany: jest.fn(), createMany: jest.fn() },
    classTeacher: { findMany: jest.fn().mockResolvedValue([{ id: 'class-teacher-1' }]) },
    scheduleEntry: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
    classroom: { findUnique: jest.fn() },
  };
  const classrooms = { assertAccess: jest.fn().mockResolvedValue(undefined) };
  const realtime = { publishClassEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new SchedulesService(prisma as never, classrooms as never, realtime as never);
  return { service, prisma, transaction, classrooms, realtime };
}

describe('SchedulesService', () => {
  it('only allows a head teacher to save and rejects cross-class teachers', async () => {
    const { service, classrooms, transaction } = setup();
    classrooms.assertAccess.mockRejectedValueOnce(
      new BusinessException('FORBIDDEN_ROLE', '禁止访问'),
    );
    await expect(service.save('teacher-subject', 'class-1', validDto())).rejects.toMatchObject({
      code: 'FORBIDDEN_ROLE',
    });

    transaction.classTeacher.findMany.mockResolvedValueOnce([{ id: 'class-teacher-other' }]);
    await expect(service.save('teacher-head', 'class-1', validDto())).rejects.toMatchObject({
      code: 'SCHEDULE_TEACHER_NOT_FOUND',
    });
    expect(transaction.scheduleEntry.createMany).not.toHaveBeenCalled();
  });

  it('validates time format, range, overlap, and duplicate cells', async () => {
    const { service } = setup();
    await expect(
      service.save('teacher-head', 'class-1', {
        ...validDto(),
        templates: [
          {
            ...validDto().templates[0],
            periods: [{ periodNo: 1, startTime: '8:00', endTime: '08:40' }, periods[1]],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_TIME_INVALID' });
    await expect(
      service.save('teacher-head', 'class-1', {
        ...validDto(),
        templates: [
          {
            ...validDto().templates[0],
            periods: [{ periodNo: 1, startTime: '09:00', endTime: '08:40' }, periods[1]],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_TIME_RANGE_INVALID' });
    await expect(
      service.save('teacher-head', 'class-1', {
        ...validDto(),
        templates: [
          {
            ...validDto().templates[0],
            periods: [{ periodNo: 1, startTime: '08:00', endTime: '08:55' }, periods[1]],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_TIME_OVERLAP' });
    await expect(
      service.save('teacher-head', 'class-1', {
        ...validDto(),
        entries: [validDto().entries[0], validDto().entries[0]],
      }),
    ).rejects.toMatchObject({ code: 'SCHEDULE_ENTRY_DUPLICATED' });
  });

  it('deletes omitted templates, saves in one transaction, and publishes a change event', async () => {
    const { service, prisma, transaction, realtime } = setup();
    prisma.classroom.findUnique.mockResolvedValueOnce({
      activeScheduleTemplateId: 'template-1',
      scheduleTemplates: [{ id: 'template-1', name: '标准作息', periods }],
      scheduleEntries: [
        {
          weekday: 3,
          periodNo: 1,
          courseName: '数学',
          classTeacher: { id: 'class-teacher-1', teacher: { id: 'teacher-1', name: '王老师' } },
        },
      ],
    });

    const result = await service.save('teacher-head', 'class-1', validDto());
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.scheduleTemplate.deleteMany).toHaveBeenCalledWith({
      where: { classId: 'class-1', id: { notIn: ['template-1'] } },
    });
    expect(transaction.scheduleEntry.deleteMany).toHaveBeenCalledWith({
      where: { classId: 'class-1' },
    });
    expect(transaction.classroom.update).toHaveBeenCalledWith({
      where: { id: 'class-1' },
      data: { activeScheduleTemplateId: 'template-1' },
    });
    expect(realtime.publishClassEvent).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({
        type: 'SCHEDULE_CHANGED',
        payload: { activeTemplateId: 'template-1' },
      }),
    );
    expect(result.entries[0].classTeacherId).toBe('class-teacher-1');
  });
});
