import { Elysia, t } from 'elysia';
import { prismaPlugin } from '../../plugins/prisma';
import { authPlugin } from '../../plugins/auth';
import { BusinessError } from '../../plugins/error-handler';

export const classroomsController = new Elysia({ prefix: '/classes' })
  .use(prismaPlugin)
  .use(authPlugin)
  .get(
    '',
    async ({ prisma, user }) => {
      const links = await prisma.classTeacher.findMany({
        where: { teacherId: user!.sub, status: 'ACTIVE' },
        include: { classroom: true },
        orderBy: { createdAt: 'asc' },
      });

      const data = links.map((link) => ({
        id: link.classroom.id,
        name: link.classroom.name,
        grade: link.classroom.grade,
        schoolYear: link.classroom.schoolYear,
        gridRows: link.classroom.gridRows,
        gridCols: link.classroom.gridCols,
        role: link.role,
        subject: link.subject,
      }));

      return { data };
    },
    {
      requireUser: true,
      detail: {
        summary: '列出当前用户可访问班级',
        tags: ['Classrooms'],
        security: [{ 'access-token': [] }],
      },
    },
  )
  .get(
    '/:classId',
    async ({ prisma, user, params: { classId } }) => {
      const access = await prisma.classTeacher.findFirst({
        where: {
          teacherId: user!.sub,
          classId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          classId: true,
          teacherId: true,
          role: true,
          subject: true,
        },
      });

      if (!access) {
        throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '无权访问该班级', 403);
      }

      const classroom = await prisma.classroom.findUnique({
        where: { id: classId },
      });

      if (!classroom) {
        throw new BusinessError('CLASSROOM_NOT_FOUND', '班级不存在', 404);
      }

      return {
        data: {
          ...classroom,
          role: access.role,
          subject: access.subject,
        },
      };
    },
    {
      requireUser: true,
      params: t.Object({
        classId: t.String(),
      }),
      detail: {
        summary: '获取班级详情',
        tags: ['Classrooms'],
        security: [{ 'access-token': [] }],
      },
    },
  )
  .patch(
    '/:classId',
    async ({ prisma, user, params: { classId }, body }) => {
      const access = await prisma.classTeacher.findFirst({
        where: {
          teacherId: user!.sub,
          classId,
          status: 'ACTIVE',
          role: 'HEAD_TEACHER',
        },
      });

      if (!access) {
        throw new BusinessError('FORBIDDEN_ROLE', '仅班主任可调整班级基础信息与网格', 403);
      }

      const classroom = await prisma.classroom.findUnique({
        where: { id: classId },
        include: {
          currentLayout: {
            select: { seats: { select: { rowIndex: true, colIndex: true } } },
          },
        },
      });

      if (!classroom) {
        throw new BusinessError('CLASSROOM_NOT_FOUND', '班级不存在', 404);
      }

      const rows = body.gridRows ?? classroom.gridRows;
      const cols = body.gridCols ?? classroom.gridCols;
      const hasOutOfBoundsSeat = classroom.currentLayout?.seats.some(
        (seat) => seat.rowIndex >= rows || seat.colIndex >= cols,
      );

      if (hasOutOfBoundsSeat) {
        throw new BusinessError(
          'CLASSROOM_GRID_HAS_OUT_OF_BOUNDS_SEATS',
          '当前座位布局包含调整后网格范围外的座位',
          409,
        );
      }

      const updated = await prisma.classroom.update({
        where: { id: classId },
        data: {
          name: body.name,
          grade: body.grade,
          schoolYear: body.schoolYear,
          gridRows: body.gridRows,
          gridCols: body.gridCols,
          autoSeatRotationEnabled: body.autoSeatRotationEnabled,
        },
      });

      return { data: updated };
    },
    {
      requireUser: true,
      params: t.Object({
        classId: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        grade: t.Optional(t.String()),
        schoolYear: t.Optional(t.String()),
        gridRows: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
        gridCols: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
        autoSeatRotationEnabled: t.Optional(t.Boolean()),
      }),
      detail: {
        summary: '更新班级基础信息、网格与自动轮换设置',
        tags: ['Classrooms'],
        security: [{ 'access-token': [] }],
      },
    },
  );
