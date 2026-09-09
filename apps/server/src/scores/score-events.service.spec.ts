import { ScoreEventType } from '@prisma/client';
import type { PrismaService } from '../prisma';
import type { RealtimeService } from '../realtime/realtime.service';
import { ScoreEventsService } from './score-events.service';
import type { CreateScoreEventDto } from './dto';
import type { ScorePeriodsService } from './score-periods.service';

describe('ScoreEventsService policy calculations', () => {
  function setup() {
    const prisma = {} as PrismaService;
    const periods = {} as ScorePeriodsService;
    const realtime = {} as RealtimeService;
    const service = new ScoreEventsService(prisma, periods, realtime);
    const tx = {
      scoreEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { service, tx };
  }

  async function calculate(
    service: ScoreEventsService,
    tx: { scoreEvent: { findMany: jest.Mock } },
    dto: CreateScoreEventDto,
  ) {
    return (
      service as unknown as {
        calculateDeltas: (
          transaction: unknown,
          classId: string,
          periodId: string,
          occurredAt: Date,
          input: CreateScoreEventDto,
        ) => Promise<number[]>;
      }
    ).calculateDeltas(tx, 'class-1', 'period-1', new Date('2026-08-10T02:00:00.000Z'), dto);
  }

  it.each([
    [ScoreEventType.LATE, { minutesLate: 10001 }, [-10001]],
    [ScoreEventType.SCHOOL_UNIFORM, {}, [-1]],
    [ScoreEventType.NOISIEST_CLASS_TOP3, { rank: 1 }, [-10]],
    [ScoreEventType.NOISIEST_CLASS_TOP3, { rank: 2 }, [-8]],
    [ScoreEventType.NOISIEST_CLASS_TOP3, { rank: 3 }, [-6]],
    [ScoreEventType.EXAM_GRADE_TOP10, { rank: 1 }, [10]],
    [ScoreEventType.EXAM_GRADE_TOP10, { rank: 10 }, [1]],
    [ScoreEventType.SUBJECT_TOP3, { rank: 3 }, [1]],
    [ScoreEventType.BLACKBOARD, { rank: 3 }, [0]],
    [ScoreEventType.INDIVIDUAL_ACTIVITY, { rank: 2 }, [6]],
    [ScoreEventType.SPORTS_FINAL_TOP8, { rank: 8 }, [3]],
    [
      ScoreEventType.GROUP_ACTIVITY,
      { rank: 2, isOrganizer: true, specialContribution: true },
      [13],
    ],
    [ScoreEventType.ACTIVITY_NEGATIVE, {}, [-10]],
    [ScoreEventType.HOMEWORK_PRAISE, { manualDelta: 7 }, [7]],
    [ScoreEventType.COMMITTEE_TASK_COMPLETED, {}, [0]],
  ])('calculates %s using the fixed or teacher-confirmed value', async (type, fields, expected) => {
    const { service, tx } = setup();
    const result = await calculate(service, tx, {
      type,
      studentIds: ['student-1'],
      ...fields,
    } as CreateScoreEventDto);

    expect(result).toEqual(expected);
  });

  it('doubles evening self-study penalties per student on the same Taipei day', async () => {
    const { service, tx } = setup();
    tx.scoreEvent.findMany.mockResolvedValue([
      {
        occurredAt: new Date('2026-08-09T15:30:00.000Z'),
        participants: [{ studentId: 'student-1' }],
      },
      {
        occurredAt: new Date('2026-08-10T01:30:00.000Z'),
        participants: [{ studentId: 'student-1' }],
      },
    ]);

    const result = await calculate(service, tx, {
      type: ScoreEventType.EVENING_SELF_STUDY_CALLOUT,
      studentIds: ['student-1', 'student-2'],
    });

    expect(result).toEqual([-4, -2]);
  });
});
