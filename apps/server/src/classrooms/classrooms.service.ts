import { HttpStatus, Injectable } from '@nestjs/common';
import { RelationStatus, TeacherRole } from '@prisma/client';
import { BusinessException } from '../common';
import { PrismaService } from '../prisma';
import { UpdateClassroomDto } from './dto/update-classroom.dto';

@Injectable()
export class ClassroomsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(userId: string, classId: string, roles?: TeacherRole[]) {
    const access = await this.prisma.classTeacher.findFirst({
      where: {
        teacherId: userId,
        classId,
        status: RelationStatus.ACTIVE,
        ...(roles?.length ? { role: { in: roles } } : {}),
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
      throw new BusinessException('FORBIDDEN_CLASS_ACCESS', '无权访问该班级', HttpStatus.FORBIDDEN);
    }
    return access;
  }

  async listForUser(userId: string) {
    const links = await this.prisma.classTeacher.findMany({
      where: { teacherId: userId, status: RelationStatus.ACTIVE },
      include: { classroom: true },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((link) => ({
      id: link.classroom.id,
      name: link.classroom.name,
      grade: link.classroom.grade,
      schoolYear: link.classroom.schoolYear,
      gridRows: link.classroom.gridRows,
      gridCols: link.classroom.gridCols,
      role: link.role,
      subject: link.subject,
    }));
  }

  async get(userId: string, classId: string) {
    const access = await this.assertAccess(userId, classId);
    const classroom = await this.prisma.classroom.findUnique({ where: { id: classId } });
    if (!classroom) {
      throw new BusinessException('CLASSROOM_NOT_FOUND', '班级不存在', HttpStatus.NOT_FOUND);
    }
    return { ...classroom, role: access.role, subject: access.subject };
  }

  async update(userId: string, classId: string, dto: UpdateClassroomDto) {
    await this.assertAccess(userId, classId, [TeacherRole.HEAD_TEACHER]);
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      include: {
        currentLayout: {
          select: { seats: { select: { rowIndex: true, colIndex: true } } },
        },
      },
    });
    if (!classroom) {
      throw new BusinessException('CLASSROOM_NOT_FOUND', '班级不存在', HttpStatus.NOT_FOUND);
    }
    const rows = dto.gridRows ?? classroom.gridRows;
    const cols = dto.gridCols ?? classroom.gridCols;
    const hasOutOfBoundsSeat = classroom.currentLayout?.seats.some(
      (seat) => seat.rowIndex >= rows || seat.colIndex >= cols,
    );
    if (hasOutOfBoundsSeat) {
      throw new BusinessException(
        'CLASSROOM_GRID_HAS_OUT_OF_BOUNDS_SEATS',
        '当前座位布局包含调整后网格范围外的座位',
        HttpStatus.CONFLICT,
      );
    }
    return this.prisma.classroom.update({
      where: { id: classId },
      data: {
        name: dto.name,
        grade: dto.grade,
        schoolYear: dto.schoolYear,
        gridRows: dto.gridRows,
        gridCols: dto.gridCols,
      },
    });
  }
}
