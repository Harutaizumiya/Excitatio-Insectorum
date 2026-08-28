# Excitatio Insectorum Monorepo

Classroom seating, score incentives, teacher workflows, display screens, and realtime events in a Turborepo monorepo.

## Applications and packages

- `apps/web` (`@repo/web`): Next.js 16 frontend. The first release runs entirely on realistic Mock data.
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

To run the complete stack, copy `.env.example` to `.env`, start PostgreSQL and Redis, generate the Prisma client, and launch the monorepo:

```bash
docker compose up -d
pnpm db:generate
pnpm db:migrate:deploy
pnpm dev
```

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
- `pnpm format`: format code with Prettier.
