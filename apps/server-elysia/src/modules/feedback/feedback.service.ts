import { randomInt, randomUUID } from 'node:crypto';
import {
  FeedbackStatus,
  FeedbackType,
  Prisma,
  PrismaClient,
  UsageClientType,
  type TeacherRole,
} from '@prisma/client';
import { BusinessError } from '../../plugins/error-handler';
import { prisma } from '../../plugins/prisma';

export interface CreateFeedbackInput {
  type: FeedbackType;
  description: string;
  screenshotUrl?: string;
  clientType: UsageClientType;
  module?: string;
  page?: string;
  appVersion?: string;
  browser?: string;
  traceId?: string;
}

export interface FeedbackListQuery {
  status?: FeedbackStatus;
  type?: FeedbackType;
  page?: number;
  pageSize?: number;
}

async function findClassAccess(
  db: PrismaClient,
  userId: string,
  classId: string,
): Promise<{ role: TeacherRole } | null> {
  return db.classTeacher.findFirst({
    where: { teacherId: userId, classId, status: 'ACTIVE' },
    select: { role: true },
  });
}

function assertSafeScreenshotUrl(value?: string): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BusinessError('FEEDBACK_SCREENSHOT_URL_INVALID', '截图地址无效', 400);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BusinessError('FEEDBACK_SCREENSHOT_URL_INVALID', '截图地址仅支持 HTTP 或 HTTPS', 400);
  }
  return url.toString();
}

export class FeedbackService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async create(classId: string, userId: string, input: CreateFeedbackInput) {
    if (!(await findClassAccess(this.db, userId, classId))) {
      throw new BusinessError('FORBIDDEN_CLASS_ACCESS', '无权向该班级提交反馈', 403);
    }
    if (input.clientType === UsageClientType.DISPLAY) {
      throw new BusinessError('FEEDBACK_CLIENT_INVALID', '班主任反馈不能使用大屏端类型', 400);
    }
    const description = input.description.trim();
    if (!description) {
      throw new BusinessError('FEEDBACK_DESCRIPTION_REQUIRED', '请填写反馈内容', 400);
    }

    const traceId = input.traceId || randomUUID();
    const commonData = {
      type: input.type,
      description,
      screenshotUrl: assertSafeScreenshotUrl(input.screenshotUrl),
      clientType: input.clientType,
      classId,
      submittedById: userId,
      module: input.module,
      page: input.page?.split(/[?#]/, 1)[0],
      appVersion: input.appVersion,
      browser: input.browser,
      traceId,
    } satisfies Omit<Prisma.FeedbackUncheckedCreateInput, 'id' | 'code'>;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = this.createCode();
      try {
        return await this.db.feedback.create({
          data: { ...commonData, code },
          select: { id: true, code: true, status: true, traceId: true, createdAt: true },
        });
      } catch (error) {
        const duplicated =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!duplicated || attempt === 4) throw error;
      }
    }
    throw new BusinessError('FEEDBACK_CODE_UNAVAILABLE', '暂时无法生成反馈编号', 503);
  }

  async list(classId: string, userId: string, query: FeedbackListQuery) {
    await this.assertHeadTeacher(userId, classId);
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const where: Prisma.FeedbackWhereInput = {
      classId,
      status: query.status,
      type: query.type,
    };
    const [data, total] = await Promise.all([
      this.db.feedback.findMany({
        where,
        select: {
          id: true,
          code: true,
          type: true,
          status: true,
          clientType: true,
          appVersion: true,
          traceId: true,
          createdAt: true,
          classroom: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.feedback.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async get(classId: string, feedbackId: string, userId: string) {
    await this.assertHeadTeacher(userId, classId);
    const feedback = await this.db.feedback.findFirst({
      where: { id: feedbackId, classId },
      include: {
        classroom: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        processedBy: { select: { id: true, name: true } },
      },
    });
    if (!feedback) throw new BusinessError('FEEDBACK_NOT_FOUND', '反馈不存在', 404);
    return feedback;
  }

  async update(
    classId: string,
    feedbackId: string,
    userId: string,
    input: { status?: FeedbackStatus; processingNote?: string | null },
  ) {
    await this.assertHeadTeacher(userId, classId);
    if (input.status === undefined && input.processingNote === undefined) {
      throw new BusinessError('FEEDBACK_UPDATE_EMPTY', '没有需要更新的反馈信息', 400);
    }
    const exists = await this.db.feedback.findFirst({
      where: { id: feedbackId, classId },
      select: { id: true },
    });
    if (!exists) throw new BusinessError('FEEDBACK_NOT_FOUND', '反馈不存在', 404);

    return this.db.feedback.update({
      where: { id: feedbackId },
      data: {
        status: input.status,
        processingNote: input.processingNote,
        processedById: userId,
        processedAt: new Date(),
      },
      include: {
        classroom: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        processedBy: { select: { id: true, name: true } },
      },
    });
  }

  private async assertHeadTeacher(userId: string, classId: string) {
    const access = await findClassAccess(this.db, userId, classId);
    if (!access || access.role !== 'HEAD_TEACHER') {
      throw new BusinessError('FORBIDDEN_ROLE', '仅班主任可管理本班反馈', 403);
    }
  }

  private createCode(now = new Date()): string {
    const date = now.toISOString().slice(0, 10).replaceAll('-', '');
    const suffix = randomInt(0, 1_000_000).toString().padStart(6, '0');
    return `FB-${date}-${suffix}`;
  }
}

export const feedbackService = new FeedbackService();
