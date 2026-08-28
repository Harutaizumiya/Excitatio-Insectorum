# Display page design QA

## Source visual truth

- Source: `C:\Users\Haruta\Documents\产品原型\Excitatio-Insectorum.pen`
- Target frame: `V6z4r` · `Screen / 智慧教室大屏 (放大自适应版)`
- Source frame: 1440 × 860 CSS px
- Source export: `C:\Users\Haruta\Documents\code\APP\Excitatio-Insectorum\design-source-display.png\V6z4r.png`

## Implementation evidence

- Preview: `http://localhost:3002/display`
- Screenshot: `C:\Users\Haruta\Documents\code\APP\Excitatio-Insectorum\display-qa.png`
- Side-by-side comparison: `C:\Users\Haruta\Documents\code\APP\Excitatio-Insectorum\design-qa-comparison.png`
- CSS viewport: 1440 × 860 px
- Implementation screenshot: 1440 × 860 px
- Production browser device pixel ratio: 2
- The Pencil export is 1441 × 861 because its 1 px outer stroke is included in the exported bounds; comparison uses the same 1440 × 860 content frame.

## Target state

- Pure display canvas with no previous page header, tabs, status bar, or footer chrome.
- Class title: `高一 (10) 班`
- Course rail: three completed blocks, active `数学 (进行中)`, and four upcoming blocks.
- Seat matrix: 7 rows × 9 columns.
- Row 1 contains the centered podium; rows 2–7 contain the two vertical corridor columns.
- Selected seat: `张三` at row 2, column 3.
- Right rail contains `课堂表现 TOP 榜` and `进步跃升榜 (较上周)`.
- Zoom controller starts at 100%.
- No random-pick overlay is active in the captured state.

## Full-view comparison

The source and implementation were inspected together at the same 1440 × 860 CSS viewport. The rewrite preserves the target hierarchy and proportions: 24 px outer gap, 28 px horizontal canvas padding, 1030 px left seat area, 330 px right ranking rail, 44 px top rail, 656 px seat matrix, and 36 px zoom controller.

The implementation matches the source's light gray canvas, rounded white ranking cards, 7 × 9 seat geometry, centered podium, corridor treatment, selected-seat emphasis, ranking hierarchy, and bottom-left zoom control. All content remains visible at the target frame without persistent overflow.

## Focused regions

- Course rail: source square cadence and active blue treatment are preserved; active content is `数学 (进行中)` as rendered by the source frame.
- Seat canvas: 96 × 80 seat cells, 7 rows, 9 columns, 16 px row rhythm, podium in row 1 column 5, corridors in column 5 and column 7 below the podium.
- Selected seat: `张三` uses the source blue fill, 2.5 px blue border, blue label, and elevated shadow.
- Ranking rail: source card padding, radius, border, podium order, names, and progress deltas are preserved. Ant Design icons replace source emoji glyphs to keep icon rendering consistent with the existing UI stack.
- Zoom control: uses the existing beUI `Button` primitive with functional minus and plus controls.

## Comparison history

This was a full visual rewrite. The first comparison against the source identified major P1/P2 mismatches from the previous implementation: extra header/tabs/status/footer chrome, wrong ranking data and card hierarchy, incorrect corridor geometry, and different left/right proportions. Those elements were removed or corrected in the new pure-canvas implementation.

No actionable P0, P1, or P2 findings remain in the final capture.

Optional P3 follow-up: validate 1280 × 720 and ultrawide classroom resolutions after live backend data replaces the current mock payload.

## Interaction and runtime verification

- Zoom interaction: 100% → 110% → 100% passed.
- Realtime interaction: teacher page random pick synchronized to the display highlight through the existing `classroom-realtime:v1` BroadcastChannel contract.
- Browser console: no errors or warnings in the final production display and teacher pages.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.

## Implementation checklist

- [x] Re-read the target `.pen` frame and extracted the page hierarchy.
- [x] Removed the previous display-page visual design.
- [x] Rebuilt the display page against the source frame dimensions and spacing.
- [x] Reused the existing realtime adapter and data contract.
- [x] Integrated the existing beUI button primitive and Ant Design icons.
- [x] Verified full-view and focused-region screenshots.
- [x] Verified zoom and realtime interactions.
- [x] Ran typecheck, lint, and production build.

final result: passed
