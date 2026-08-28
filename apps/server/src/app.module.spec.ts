import { Test } from '@nestjs/testing';

describe('AppModule', () => {
  it('wires every MVP module without a database or Redis connection', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/excitatio_insectorum?schema=public';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-with-at-least-32-characters';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-with-at-least-32-characters';
    process.env.DEVICE_BINDING_ENCRYPTION_SECRET =
      'test-device-binding-secret-with-at-least-32-characters';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.SWAGGER_ENABLED = 'false';

    const [
      { AppModule },
      { AuthService },
      { DisplaysService },
      { PrismaService },
      { RandomPickService },
      { RankingService },
      { RedisService },
      { ScoreRecordsService },
      { SeatingService },
      { StudentsService },
    ] = await Promise.all([
      import('./app.module'),
      import('./auth'),
      import('./displays'),
      import('./prisma'),
      import('./random-pick'),
      import('./ranking'),
      import('./redis'),
      import('./scores'),
      import('./seating'),
      import('./students'),
    ]);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RedisService)
      .useValue({ client: {} })
      .compile();

    expect(moduleRef.get(AuthService)).toBeDefined();
    expect(moduleRef.get(StudentsService)).toBeDefined();
    expect(moduleRef.get(SeatingService)).toBeDefined();
    expect(moduleRef.get(ScoreRecordsService)).toBeDefined();
    expect(moduleRef.get(RankingService)).toBeDefined();
    expect(moduleRef.get(DisplaysService)).toBeDefined();
    expect(moduleRef.get(RandomPickService)).toBeDefined();

    await moduleRef.close();
  });
});
