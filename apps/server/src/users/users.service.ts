import { HttpStatus, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { BusinessException } from '../common';
import { PrismaService } from '../prisma';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE },
      select: { id: true, name: true, account: true, status: true },
    });
    if (!user) {
      throw new BusinessException('USER_NOT_FOUND', '用户不存在或已停用', HttpStatus.NOT_FOUND);
    }
    return user;
  }
}
