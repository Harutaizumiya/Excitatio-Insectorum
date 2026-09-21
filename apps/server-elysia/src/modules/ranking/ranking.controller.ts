import { Elysia, t } from 'elysia';
import { rankingService } from './ranking.service';
import { authPlugin } from '../../plugins/auth';
import { studentsService } from '../students/students.service';

export const rankingController = new Elysia({ prefix: '/classes/:classId/ranking' })
  .use(authPlugin)
  .get(
    '',
    async ({ user, params: { classId } }) => {
      await studentsService.assertAccess(user!.sub, classId);
      const data = await rankingService.getWeeklyRanking(classId);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      detail: { summary: '查询本周 Top3 与周环比进步榜', tags: ['Ranking'] },
    },
  );
