# Excitatio Insectorum Monorepo

Classroom seating, score incentives, teacher workflows, display screens, and realtime events in a Turborepo monorepo.

## Applications and packages

- `apps/web` (`@repo/web`): Next.js 16 frontend.
- `apps/server` (`@repo/server`): NestJS modular-monolith REST API and Socket.IO gateway.
- `packages/database` (`@repo/database`): Prisma schema, migrations, and shared database client.
- `packages/typescript-config`: shared TypeScript configurations.
- `packages/eslint-config`: shared ESLint configuration.

## Quick start

```bash
pnpm install
pnpm --filter @repo/web dev
```

Open `http://localhost:3001/login`. The frontend defaults to `NEXT_PUBLIC_DATA_MODE=mock` and does not require PostgreSQL, Redis, or the backend.

To run the current local stack, SQLite is enabled by default. Copy `.env.example` to `apps/server/.env`; create `apps/web/.env.local` with `NEXT_PUBLIC_DATA_MODE=api` and `NEXT_PUBLIC_API_ORIGIN=http://localhost:3000`; make sure Redis is available; then generate the Prisma client, apply the SQLite migration, seed the database, and launch the applications in separate terminals:

```bash
pnpm db:generate
pnpm db:migrate:deploy
pnpm --filter @repo/server seed
pnpm --filter @repo/server dev
pnpm --filter @repo/web dev
```

The SQLite database is stored at `packages/database/prisma/sqlite/dev.db`. PostgreSQL remains supported by using the canonical `packages/database/prisma/schema.prisma` and the `*:postgresql` database scripts.

To switch a local environment to PostgreSQL, stop the running server first, set `DATABASE_URL` to the PostgreSQL connection string, run the PostgreSQL generate/migration commands, and set the same URL in `apps/server/.env`:

```powershell
$env:DATABASE_URL = "postgresql://postgres:123456@localhost:5432/excitatio_insectorum?schema=public"
pnpm db:generate:postgresql
pnpm db:migrate:deploy:postgresql
```

To switch back, restore `DATABASE_URL=file:./dev.db` in `apps/server/.env` (and in the current shell if a PostgreSQL variable was exported) and run `pnpm db:generate`.

The backend uses the `/api/v1` prefix. Swagger is available at `/api/docs` when `SWAGGER_ENABLED=true`, and Socket.IO uses the `/realtime` namespace.

## Commands

- `pnpm build`: build all packages and applications.
- `pnpm dev`: start development mode.
- `pnpm lint`: run ESLint checks.
- `pnpm typecheck`: run TypeScript checks.
- `pnpm test`: run unit tests.
- `pnpm db:generate`: regenerate Prisma Client.
- `pnpm db:migrate:dev`: run a development migration.
- `pnpm db:migrate:deploy`: apply production migrations.
- `pnpm --filter @repo/database db:generate:postgresql`: generate the PostgreSQL Prisma Client.
- `pnpm --filter @repo/database db:migrate:deploy:postgresql`: apply the PostgreSQL migrations.
- `pnpm format`: format code with Prettier.
