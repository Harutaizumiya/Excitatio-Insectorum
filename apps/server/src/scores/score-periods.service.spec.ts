import { ScorePeriodStatus } from '@prisma/client';
import type { PrismaService } from '../prisma';
import type { RealtimeService } from '../realtime/realtime.service';
import { ScorePeriodsService } from './score-periods.service';

describe('ScorePeriodsService settlement', () => {
  it('settles no-violation and eligible committee rewards once', async () => {
    const period: {
      id: string;
      startAt: Date;
      endAt: Date;
      initialScore: number;
      status: ScorePeriodStatus;
      settledAt: Date | null;
    } = {
      id: 'period-1',
      startAt: new Date('2026-07-31T16:00:00.000Z'),
      endAt: new Date('2026-08-31T16:00:00.000Z'),
      initialScore: 100,
      status: ScorePeriodStatus.OPEN,
      settledAt: null,
    };
    const tx = {
      scorePeriod: {
        findFirst: jest.fn().mockResolvedValue(period),
        update: jest.fn().mockImplementation(async () => {
          period.status = ScorePeriodStatus.SETTLED;
          period.settledAt = new Date('2026-09-01T00:00:00.000Z');
          return period;
        }),
      },
      classTeacher: {
        findFirst: jest.fn().mockResolvedValue({ teacherId: 'head-1', subject: null }),
      },
      student: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'student-1' }, { id: 'student-2' }, { id: 'student-3' }]),
      },
      scoreRecord: {
        findMany: jest.fn().mockResolvedValue([{ studentId: 'student-2', reversion: null }]),
        createMany: jest.fn(),
      },
      scoreEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'event-no-violation' })
          .mockResolvedValueOnce({ id: 'event-committee' }),
        findMany: jest.fn().mockResolvedValue([{ participants: [{ studentId: 'student-2' }] }]),
      },
      scoreEventParticipant: { createMany: jest.fn() },
      classCommitteeAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            studentId: 'student-1',
            role: '班长',
            trialEndsAt: new Date('2026-08-10T00:00:00.000Z'),
          },
          {
            studentId: 'student-2',
            role: '团支书',
            trialEndsAt: new Date('2026-08-10T00:00:00.000Z'),
          },
          {
            studentId: 'student-3',
            role: '学习委员',
            trialEndsAt: new Date('2026-09-10T00:00:00.000Z'),
          },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as unknown as PrismaService;
    const realtime = { publishClassEvent: jest.fn() } as unknown as RealtimeService;
    const service = new ScorePeriodsService(prisma, realtime);

    await service.settlePeriod('class-1', 'period-1', 'head-1');

    expect(tx.scoreEvent.create).toHaveBeenCalledTimes(2);
    expect(tx.scoreRecord.createMany).toHaveBeenCalledTimes(2);
    expect(tx.scoreRecord.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ studentId: 'student-1', delta: 10 }),
      expect.objectContaining({ studentId: 'student-3', delta: 10 }),
    ]);
    expect(tx.scoreRecord.createMany.mock.calls[1][0].data).toEqual([
      expect.objectContaining({ studentId: 'student-1', delta: 10 }),
      expect.objectContaining({ studentId: 'student-2', delta: 10 }),
    ]);
    expect(tx.scoreEventParticipant.createMany).toHaveBeenCalledTimes(2);
    expect(realtime.publishClassEvent).toHaveBeenCalledTimes(5);

    await service.settlePeriod('class-1', 'period-1', 'head-1');
    expect(tx.scoreEvent.create).toHaveBeenCalledTimes(2);
    expect(tx.scoreRecord.createMany).toHaveBeenCalledTimes(2);
    expect(realtime.publishClassEvent).toHaveBeenCalledTimes(5);
  });

  it('is idempotent for an already settled period', async () => {
    const period = {
      id: 'period-2',
      startAt: new Date('2026-08-31T16:00:00.000Z'),
      endAt: new Date('2026-09-30T16:00:00.000Z'),
      initialScore: 100,
      status: ScorePeriodStatus.SETTLED,
      settledAt: new Date('2026-10-01T00:00:00.000Z'),
    };
    const tx = {
      scorePeriod: { findFirst: jest.fn().mockResolvedValue(period) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ScorePeriodsService(prisma, {} as RealtimeService);

    await expect(service.settlePeriod('class-1', 'period-2')).resolves.toEqual(period);
    expect(tx.scorePeriod.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'period-2', classId: 'class-1' } }),
    );
  });
});
