---
name: token-editing-design
description: Design decisions for token editing on the tactical grid — HP bar, radial condition ring (max 8 slots), three UI approach mockups (2026-06-26)
metadata:
  type: project
---

## Token editing design — tactical grid

Static HTML mockups at `docs/mockups/token-editing/`. Three approaches evaluated.

### Data contract
```
character = {
  hp: { current, total },
  states: Array<{ id, icon, label, level? }>,  // max 8 active shown in ring
  stats: Array<{ label, value }>
}
```
State types come from the game system registry — not hardcoded in components.

### Shared invariants (all approaches)
- HP bar (7px thin) always visible above damaged or conditioned tokens, even when not selected.
  Color: green >50%, orange 20–50%, red <20% max HP.
- Active conditions visible at rest as small 19px radial badges around token edge.
- Token = circular avatar (user photo crop) with gold border — NO ally/enemy wax-seal coloring.
- Max 8 conditions in ring at fixed 45° slots (slot 0 = top, clockwise).

### Condition ring geometry
- Ring radius r = 44px from token center.
- Icon size = 22×22px, placed at `(cx - 11, cy - 11)` from token top-left.
- 8 slot angles: -90°, -45°, 0°, 45°, 90°, 135°, 180°, 225° (top → clockwise).
- Token center relative to its `position:absolute` TL: (25, 25) for a 50×50 token circle.

### Approach comparison
| | Approach 1 Popover | Approach 2 Modal | Approach 3 Radial HUD |
|---|---|---|---|
| Screen space | Low-medium | High | Minimal |
| Combat speed | Fast | Slow | Fastest |
| Map visibility | Good | Poor | Excellent |
| Overlap risk | None | None | Medium |
| Impl effort | Medium | Low | High |

### Recommendation
Approach 3 (Radial HUD) as primary in-combat interface +
Approach 2 (Modal) as fallback "full editor" reachable via ⚙ button inside the HUD.
Approach 1 (Popover) as user preference toggle if ring has z-index issues.

### Approach 3 — implementation notes
- `overflow: visible` on grid scene; selected token group `z-index: 100`.
- `.tok--neighbour` class reduces nearby badge ring opacity to 0.7 while any token is selected.
- Interactive HP row replaces thin bar on selection; thin bar returns on deselect.
- State palette opens via `createPortal` to `document.body` from ghost "+" slot click.
- Stat chips row: flex row below ring, 5 chips configurable per system.

**Why:** This was [designed 2026-06-26] for a system-agnostic token editing surface.
**How to apply:** When implementing, start with Approach 3's HUD ring + keep Approach 2 modal for
between-encounter deep edits. Ref mockups for exact pixel positions and CSS patterns.

Related: [[ui-conventions]], [[layout-architecture]], [[project_ui_conventions]]
