# Frontend Mock MVP handoff

## Outcome

The first frontend release is implemented in `apps/web` as a Next.js 16 App Router application. All product flows use local Mock data, so the UI can be reviewed without PostgreSQL, Redis, or the NestJS server.

## Routes

- Authentication: `/login`
- Administration: `/admin`, `/admin/students`, `/admin/seating`, `/admin/teachers`, `/admin/score-rules`, `/admin/score-records`, `/admin/display-devices`
- Teacher and invitation: `/teacher`, `/teacher/history`, `/invite/[token]`
- Classroom display: `/display`, `/display/bind`

## Implementation

- UI: Ant Design, shadcn/ui, Lucide icons, Tailwind CSS, and dnd-kit.
- Forms and validation: React Hook Form and Zod.
- Data: typed Mock repository, MSW handlers, and local feature adapters.
- Realtime Mock: in-page listeners plus `BroadcastChannel` for teacher/display synchronization across same-origin tabs.
- Design language: clean-room implementation inspired by the supplied reference's blue/white visual hierarchy, compact cards, pill actions, and classroom-first layouts; no source code or assets were copied.
- Display privacy: public views expose names, placement, and movement only; concrete score totals remain on admin surfaces.

## Verification

- `pnpm --filter @repo/web typecheck`: passed.
- `pnpm --filter @repo/web lint`: passed.
- `pnpm --filter @repo/web build`: passed; 16 pages generated, covering all requested routes.
- Browser smoke tests: login, admin navigation and student drawer, teacher scoring, invite activation, display binding, responsive teacher layout, and 16:9 display layout passed.
- Cross-tab test: a teacher random-pick event appeared on the open classroom display.
- Static guard scan: no explicit `any`, inline SVG, or Emoji icons in `apps/web/src`.

## Development

```bash
pnpm --filter @repo/web dev
```

Open `http://localhost:3001/login`. The real backend adapter is intentionally deferred; Mock mode is the required first-release boundary.
