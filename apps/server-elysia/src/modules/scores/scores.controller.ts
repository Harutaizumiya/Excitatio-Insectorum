import { Elysia, t } from 'elysia';
import { ScoreEventType, ScoreRecordType } from '@prisma/client';
import { scoresService } from './scores.service';
import { authPlugin } from '../../plugins/auth';
import { scoreEventsService, type CreateScoreEventInput } from './score-events.service';
import { scorePeriodsService } from './score-periods.service';

export const scoresController = new Elysia({ prefix: '/classes/:classId' })
  .use(authPlugin)
  .post(
    '/score-events',
    async ({ user, params: { classId }, body }) => {
      const data = await scoreEventsService.create(
        classId,
        user!.sub,
        body as CreateScoreEventInput,
      );
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        type: t.Enum(ScoreEventType),
        studentIds: t.Array(t.String(), { minItems: 1, uniqueItems: true }),
        occurredAt: t.Optional(t.String()),
        minutesLate: t.Optional(t.Integer({ minimum: 1 })),
        rank: t.Optional(t.Integer({ minimum: 1, maximum: 10 })),
        manualDelta: t.Optional(t.Integer({ minimum: -10000, maximum: 10000 })),
        isOrganizer: t.Optional(t.Boolean()),
        specialContribution: t.Optional(t.Boolean()),
        subject: t.Optional(t.String({ maxLength: 100 })),
        reason: t.Optional(t.String({ maxLength: 200 })),
        businessKey: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      }),
      detail: { summary: '登记结构化积分事件', tags: ['Score Periods'] },
    },
  )
  // Score Rules
  .get(
    '/score-rules',
    async ({ user, params: { classId }, query }) => {
      await scoresService.assertClassAccess(user!.sub, classId);
      const data = await scoresService.listRules(
        classId,
        query.enabled !== undefined ? query.enabled === 'true' : undefined,
      );
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      query: t.Object({ enabled: t.Optional(t.String()) }),
      detail: { summary: '查询班级积分规则', tags: ['Scores'] },
    },
  )
  .post(
    '/score-rules',
    async ({ user, params: { classId }, body }) => {
      const data = await scoresService.createRule(classId, user!.sub, body);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        name: t.String(),
        delta: t.Integer(),
        group: t.Optional(t.String()),
        description: t.Optional(t.String()),
        systemPolicyKey: t.Optional(t.String()),
      }),
      detail: { summary: '创建积分规则', tags: ['Scores'] },
    },
  )
  .patch(
    '/score-rules/:ruleId',
    async ({ user, params: { classId, ruleId }, body }) => {
      const data = await scoresService.updateRule(classId, ruleId, user!.sub, body);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), ruleId: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        delta: t.Optional(t.Integer()),
        group: t.Optional(t.String()),
        description: t.Optional(t.String()),
        systemPolicyKey: t.Optional(t.String()),
        enabled: t.Optional(t.Boolean()),
      }),
      detail: { summary: '更新积分规则', tags: ['Scores'] },
    },
  )
  .post(
    '/score-rules/:ruleId/disable',
    async ({ user, params: { classId, ruleId } }) => {
      const data = await scoresService.disableRule(classId, ruleId, user!.sub);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), ruleId: t.String() }),
      detail: { summary: '停用积分规则', tags: ['Scores'] },
    },
  )
  // Score Records
  .post(
    '/scores/rule',
    async ({ user, params: { classId }, body }) => {
      const data = await scoresService.createFromRule(classId, user!.sub, body);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        studentId: t.String(),
        ruleId: t.String(),
      }),
      detail: { summary: '使用规则创建积分', tags: ['Scores'] },
    },
  )
  .post(
    '/scores/custom',
    async ({ user, params: { classId }, body }) => {
      const data = await scoresService.createCustom(classId, user!.sub, body);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        studentId: t.String(),
        delta: t.Integer(),
        reason: t.String(),
      }),
      detail: { summary: '创建自定义积分', tags: ['Scores'] },
    },
  )
  .get(
    '/scores',
    async ({ user, params: { classId }, query }) => {
      await scoresService.assertClassAccess(user!.sub, classId);
      const data = await scoresService.listRecords(classId, {
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
        studentId: query.studentId,
        operatorId: query.operatorId,
        recordType: query.recordType as ScoreRecordType | undefined,
        from: query.from,
        to: query.to,
      });
      return data;
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      query: t.Object({
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
        studentId: t.Optional(t.String()),
        operatorId: t.Optional(t.String()),
        recordType: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
      detail: { summary: '分页查询班级积分流水', tags: ['Scores'] },
    },
  )
  .post(
    '/scores/:recordId/revert',
    async ({ user, params: { classId, recordId } }) => {
      const data = await scoresService.revertRecord(classId, recordId, user!.sub);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String(), recordId: t.String() }),
      detail: { summary: '撤销积分记录', tags: ['Scores'] },
    },
  )
  // Committee
  .get(
    '/committee',
    async ({ user, params: { classId } }) => {
      await scoresService.assertClassAccess(user!.sub, classId);
      const data = await scoresService.listCommittee(classId);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      detail: { summary: '查询班委名单', tags: ['Scores'] },
    },
  )
  .put(
    '/committee',
    async ({ user, params: { classId }, body }) => {
      const data = await scoresService.replaceCommittee(classId, user!.sub, body.assignments);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      body: t.Object({
        assignments: t.Array(
          t.Object({
            studentId: t.String(),
            role: t.String(),
            subject: t.Optional(t.Union([t.String(), t.Null()])),
            termStartAt: t.String(),
            termEndAt: t.Optional(t.Union([t.String(), t.Null()])),
            trialEndsAt: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        ),
      }),
      detail: { summary: '更新班委名单', tags: ['Scores'] },
    },
  )
  // Periods Summary
  .get(
    '/score-periods/current/summary',
    async ({ user, params: { classId } }) => {
      await scoresService.assertClassAccess(user!.sub, classId);
      const data = await scorePeriodsService.getCurrentSummary(classId);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      detail: { summary: '查询当前积分周期汇总', tags: ['Scores'] },
    },
  )
  .get(
    '/score-periods/summary',
    async ({ user, params: { classId }, query }) => {
      await scoresService.assertClassAccess(user!.sub, classId);
      const data = await scorePeriodsService.getSummary(classId, query.from, query.to);
      return { data };
    },
    {
      requireUser: true,
      params: t.Object({ classId: t.String() }),
      query: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
      detail: { summary: '查询积分周期或日期范围汇总', tags: ['Scores'] },
    },
  );
