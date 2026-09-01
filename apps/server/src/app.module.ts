import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth';
import { ClassroomsModule } from './classrooms';
import { AppConfigModule } from './config';
import { DisplaysModule } from './displays';
import { PrismaModule } from './prisma';
import { RandomPickModule } from './random-pick';
import { RankingModule } from './ranking';
import { RealtimeModule } from './realtime';
import { RedisModule } from './redis';
import { ScoresModule } from './scores';
import { SeatingModule } from './seating';
import { SchedulesModule } from './schedules';
import { StudentsModule } from './students';
import { TeachersModule } from './teachers';
import { UsersModule } from './users';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.getOrThrow<string>('app.nodeEnv');
        return {
          pinoHttp: {
            level: config.getOrThrow<string>('logging.level'),
            transport:
              nodeEnv === 'development'
                ? {
                    target: 'pino-pretty',
                    options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' },
                  }
                : undefined,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
            serializers: {
              req: (request) => ({
                ...request,
                url:
                  typeof request.url === 'string'
                    ? request.url.replace(
                        /(\/auth\/invitations\/)[^/]+(\/consume(?:\?|$))/,
                        '$1[REDACTED]$2',
                      )
                    : request.url,
                originalUrl:
                  typeof request.originalUrl === 'string'
                    ? request.originalUrl.replace(
                        /(\/auth\/invitations\/)[^/]+(\/consume(?:\?|$))/,
                        '$1[REDACTED]$2',
                      )
                    : request.originalUrl,
              }),
            },
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    ClassroomsModule,
    TeachersModule,
    StudentsModule,
    SeatingModule,
    ScoresModule,
    RankingModule,
    SchedulesModule,
    RealtimeModule,
    DisplaysModule,
    RandomPickModule,
  ],
})
export class AppModule {}
