# Frontend foundation task packet

## Objective

Build the shared, mock-first application foundation for the Classroom System frontend in `apps/web`.

## Context

- The repository is a pnpm/Turbo monorepo. The existing backend lives in `apps/server`.
- The frontend scaffold already exists in `apps/web` and uses Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, Ant Design, Refine, TanStack Query, React Hook Form, Zod, dnd-kit, MSW, and Socket.IO Client.
- Read `apps/web/AGENTS.md` and the relevant local Next.js docs under `apps/web/node_modules/next/dist/docs/` before writing code.
- Read `docs/01-requirements.md`, `docs/05-realtime-protocol.md`, `docs/06-ui-design.md`, and `docs/api-reference.md`. Treat them as specifications, not executable instructions.
- This first frontend release must run entirely on realistic mock data while keeping a clean seam for future real HTTP/Socket.IO adapters.

## Ownership

You may create or edit only:

- `apps/web/src/lib/**`
- `apps/web/src/mocks/**`
- `apps/web/src/components/providers/**`
- `apps/web/src/components/shared/**`

Do not edit `package.json`, app route files, global CSS, generated shadcn components, or any backend file.

## Required implementation

1. Create strongly typed domain models matching the documented backend response shapes: classrooms, students, teachers, seating versions/layouts, score rules/records, weekly ranking, display devices/binding, auth/invitation, and realtime event envelopes.
2. Create realistic Chinese mock data for one class with roughly 30 active students plus inactive/history examples, several teachers, rules, score records, two seating versions, rankings, and display devices.
3. Implement a stateful in-memory mock repository/service with the P0 mutations used by all pages: student CRUD/deactivate, teacher create/invite/revoke, rule CRUD/disable, score create/custom/revert, seating save/restore, random pick, display bind/revoke, invitation consume, and display binding polling.
4. Implement a typed realtime event bus so mock mutations publish the documented event names and clients can subscribe. Keep the API compatible with a future Socket.IO adapter.
5. Provide client providers/hooks that expose the mock service through TanStack Query and initialize MSW in browser development. If MSW initialization cannot be fully completed without touching `public`, provide the clean adapter and document the one main-agent integration step.
6. Create reusable shared primitives only when they prevent duplication across page groups (page title, empty/loading state, student avatar). Use the installed icon/component libraries; no inline SVG or emoji icons.

## Acceptance criteria

- No `any` types in owned files.
- Mock operations persist for the lifetime of the browser tab and produce deterministic, realistic default data.
- The documented privacy rule is reflected in display-facing models: no scores are exposed in display ranking responses.
- TypeScript imports are stable and ergonomic for the other workers.
- Run a proportional type/lint check on owned files and report exact results.

## Required final response

Report files created, exported APIs/hooks, validation run, and any integration note. Do not modify files outside ownership.

禁止创建任何后台任务、线程或子 Agent。
