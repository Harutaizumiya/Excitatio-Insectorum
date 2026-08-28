# Frontend teacher, invitation, and display task packet

## Objective

Implement the teacher mobile experience, invitation flow, classroom display, and display binding routes in `apps/web` using shadcn/ui/Tailwind plus the shared mock and realtime foundation.

## Context

- Read `apps/web/AGENTS.md` and relevant local Next.js 16 docs before writing.
- Read `docs/01-requirements.md`, `docs/05-realtime-protocol.md`, `docs/06-ui-design.md`, and `docs/api-reference.md` as specifications.
- Review UI patterns only in `C:/Users/Haruta/Documents/code/APP/open_fuckseats`, particularly its classroom grid, translucent header, rounded blue actions, white cards, and 1fr + side-panel composition. Do not copy implementation, assets, or GPL source.
- Shared types, stateful Mock services, and typed realtime bus are being built concurrently in `apps/web/src/lib`, `src/mocks`, and `src/components/providers`. Prefer their public barrel exports when available and keep adaptation localized.

## Ownership

You may create or edit only:

- `apps/web/src/app/teacher/**`
- `apps/web/src/app/invite/**`
- `apps/web/src/app/display/**`
- `apps/web/src/features/classroom/**`

Do not edit package/config files, global CSS, shared providers/data, shadcn-generated components, admin routes, or backend files.

## Required routes and behavior

- `/teacher`: mobile-first student grid/list, search, selected-student action panel, large score-rule buttons, custom score validated form, random pick with current-round exclusions/reset, clear success/error feedback.
- `/teacher/history`: mobile cards/compact list with filters, record detail, own-record revert confirmation, already-reverted state.
- `/invite/[token]`: async Next.js 16-compatible token handling, invitation details, consume/activate success, invalid/expired state, clear redirect/action.
- `/display`: 16:9 classroom display with view switching (seating + ranking, Top3, progress), fullscreen control, connection status, privacy-safe rankings without scores, typed realtime random-pick highlight that clears after duration, useful empty/offline fallback.
- `/display/bind`: six-digit code, expiry countdown, polling states, READY credential handoff simulation, retry/expired action.

## UI constraints

- Teacher surfaces target 360–430px, one-hand use, large tap targets, 1–2 tap common scoring actions, no dense tables.
- Display surfaces target 1920×1080 and remain readable at distance; use sparse composition, large type, no concrete score values, negative counts, or bottom rankings.
- Visual language: primary `#0a59f7`, pale blue-gray background, white rounded cards, pill actions, thin outline icons, subtle feedback motion.
- Use installed shadcn/ui, Tailwind, and icon libraries; no inline SVG, emoji icons, copied assets, or complex custom animation.
- All main buttons, dialogs/drawers, tabs, filters, score/random/revert flows, full screen, binding retry, and realtime highlight must be functional with mock/local state.

## Acceptance criteria

- All five routes render without undefined imports.
- Dynamic route params follow Next.js 16 async `params` semantics or `useParams` in a Client Component.
- No `any`; display-facing code never reveals score totals.
- Run lint/type checks scoped as closely as practical and report exact results.

## Required final response

List routes/files, interactions implemented, assumptions about shared exports, and validation results.

禁止创建任何后台任务、线程或子 Agent。
