# Frontend admin task packet

## Objective

Implement every head-teacher admin route in `apps/web` with Refine resource metadata, Ant Design components, realistic mock-first interactions, and the borrowed clean blue/white UI language.

## Context

- Read `apps/web/AGENTS.md` and relevant local Next.js 16 docs before writing.
- Read `docs/01-requirements.md`, `docs/06-ui-design.md`, and `docs/api-reference.md` as product/API specifications.
- Review the UI-only reference at `C:/Users/Haruta/Documents/code/APP/open_fuckseats`, especially `templates/base.html`, `templates/seats/classroom_detail.html`, `templates/seats/layout_editor.html`, and `static/css/styles.css`. Do not copy source, assets, text, or GPL implementation.
- Shared types and Mock services are being built concurrently under `apps/web/src/lib`, `src/mocks`, and `src/components/providers`. Prefer their barrel exports when available. Keep page code easy for the main agent to adapt if an export name differs.

## Ownership

You may create or edit only:

- `apps/web/src/app/admin/**`
- `apps/web/src/features/admin/**`

Do not edit package/config files, global CSS, shared providers/data, shadcn-generated components, teacher/invite/display routes, or backend files.

## Required routes and behavior

- `/admin`: overview metrics, quick entries, recent activity.
- `/admin/students`: search/filter table, add/edit Drawer, deactivate confirmation, history/read-only details.
- `/admin/seating`: fixed grid with podium, dnd-kit seat/student movement, empty-seat add/remove, unsaved state, save layout, history Drawer, restore confirmation.
- `/admin/teachers`: teacher table, create Modal, generated invitation link, copy action, details Drawer, regenerate/revoke confirmations.
- `/admin/score-rules`: CRUD with integer non-zero validation and enable/disable behavior.
- `/admin/score-records`: useful filters, details Drawer, reverse-entry revoke confirmation and disabled state for already reverted items.
- `/admin/display-devices`: capacity 2, online/offline status, bind-by-6-digit-code Modal, revoke confirmation, last seen.

## UI constraints

- Use Refine resource metadata for the admin information architecture and Ant Design for shell, tables, forms, Drawer, Modal, Popconfirm, Statistic, Tag, Alert, and notifications.
- Visual language: primary `#0a59f7`, soft gray-blue background, white 12–16px cards, subtle borders/shadows, pill-like primary actions, clear desktop density.
- All principal buttons, filters, form validation, modal confirmations, seat drag/drop, save/restore, copy, and view-detail interactions must work with mock/local state.
- Use Ant Design icons or another installed icon set; no inline SVG, no emoji icons, no copied reference assets.
- Keep CSS light; prefer Ant Design tokens/props and Tailwind utilities already available.

## Acceptance criteria

- All seven routes render without importing undefined modules.
- Forms have labels and realistic Chinese data, loading/empty/disabled/error feedback where appropriate.
- Responsive enough for 1280px desktop; table overflow is handled.
- No `any`, no backend changes, no copied GPL source.
- Run lint/type checks scoped as closely as practical and report results.

## Required final response

List routes/files, interactions implemented, dependencies on shared exports, and validation results.

禁止创建任何后台任务、线程或子 Agent。
