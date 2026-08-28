import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PrincipalType, isUserPrincipal } from '../common/auth/jwt-principal';
import { ClassScope } from '../common/decorators/class-scope.decorator';
import { RequirePrincipalTypes } from '../common/decorators/require-principal-types.decorator';
import { RequireRoles } from '../common/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClassAccessGuard } from '../common/guards/class-access.guard';
import { PrincipalTypeGuard } from '../common/guards/principal-type.guard';
import { RoleGuard } from '../common/guards/role.guard';
import { BusinessException } from '../common/exceptions/business.exception';
import type { RequestContext } from '../common/interfaces/request-context';
import { TeacherRole } from '@prisma/client';
import { SaveSeatLayoutDto, SeatLayoutVersionsQueryDto } from './dto/seat-layout.dto';
import { SeatingService } from './seating.service';

@ApiTags('Seat Layout')
@ApiBearerAuth('access-token')
@Controller('classes/:classId/seat-layout')
@ClassScope('classId')
@RequirePrincipalTypes(PrincipalType.USER)
@UseGuards(JwtAuthGuard, PrincipalTypeGuard, ClassAccessGuard, RoleGuard)
export class SeatingController {
  constructor(private readonly seatingService: SeatingService) {}

  @Get()
  @RequireRoles(TeacherRole.HEAD_TEACHER, TeacherRole.SUBJECT_TEACHER)
  @ApiOperation({ summary: 'Get the current seat layout' })
  @ApiParam({ name: 'classId', type: String })
  @ApiOkResponse({ description: 'Current layout snapshot' })
  async getCurrent(@Param('classId') classId: string) {
    return { data: await this.seatingService.getCurrentLayout(classId) };
  }

  @Put()
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: 'Save a complete new seat layout version' })
  @ApiParam({ name: 'classId', type: String })
  @ApiBody({ type: SaveSeatLayoutDto })
  @ApiOkResponse({ description: 'New layout version' })
  async save(
    @Param('classId') classId: string,
    @Body() body: SaveSeatLayoutDto,
    @Req() request: RequestContext,
  ) {
    return {
      data: await this.seatingService.saveLayout(classId, this.requireUserId(request), body),
    };
  }

  @Get('versions')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: 'List seat layout versions' })
  @ApiParam({ name: 'classId', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiOkResponse({ description: 'Paginated layout versions' })
  async listVersions(
    @Param('classId') classId: string,
    @Query() query: SeatLayoutVersionsQueryDto,
  ) {
    return this.seatingService.listVersions(classId, query);
  }

  @Get('versions/:versionId')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: 'Preview a historical seat layout version' })
  @ApiParam({ name: 'classId', type: String })
  @ApiParam({ name: 'versionId', type: String })
  @ApiOkResponse({ description: 'Historical layout snapshot' })
  async getVersion(@Param('classId') classId: string, @Param('versionId') versionId: string) {
    return { data: await this.seatingService.getVersion(classId, versionId) };
  }

  @Post('versions/:versionId/restore')
  @RequireRoles(TeacherRole.HEAD_TEACHER)
  @ApiOperation({ summary: 'Restore a historical seat layout as a new version' })
  @ApiParam({ name: 'classId', type: String })
  @ApiParam({ name: 'versionId', type: String })
  @ApiOkResponse({ description: 'Restored layout version' })
  async restore(
    @Param('classId') classId: string,
    @Param('versionId') versionId: string,
    @Req() request: RequestContext,
  ) {
    return {
      data: await this.seatingService.restoreVersion(
        classId,
        versionId,
        this.requireUserId(request),
      ),
    };
  }

  private requireUserId(request: RequestContext): string {
    if (!request.user || !isUserPrincipal(request.user)) {
      throw new BusinessException('FORBIDDEN_PRINCIPAL_TYPE', '当前身份无权访问');
    }
    return request.user.sub;
  }
}
