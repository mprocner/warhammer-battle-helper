# Token Editing — UX Mockup Series

Three design alternatives for editing character token data (HP, conditions/states, stats)
directly on the tactical grid in Warhammer Battle Helper.

## Data contract assumed by all mockups

```
character = {
  id: string,
  name: string,
  hp: { current: number, total: number },
  states: Array<{ id: string, icon: string, label: string, level?: number }>,  // max 8 shown in ring
  stats: Array<{ label: string, value: number }>
}
```

State types (icons, labels, whether level is applicable) come from the active game system registry.
They are **not hardcoded** — the mockups use a generic placeholder set
(poison, stunned, bleeding, slowed, shielded, buffed, blinded, burning, sleeping, paralyzed).

## Shared design invariants (all three approaches)

- **HP bar always visible** above any token that has wounds or at least one active condition.
  Color: green above 50% max HP, orange 20–50%, red below 20%.
- **Active conditions visible at rest** — even on non-selected tokens, active state badges appear
  as small 19px circles at radial positions around the token edge.
  A token with no wounds and no conditions shows no overlay at all.
- **Max 8 conditions in the ring** at fixed 45° slots (0 = top, clockwise).
  Attempting to add a 9th condition replaces the oldest or is blocked — game-system dependent.
- **Avatar tokens** — circular crop of the user-uploaded photo, gold border.
  No ally/enemy color distinction at token level.

---

## Approach 1 — Popover (`approach-1-popover.html`)

Clicking a token opens a 238px-wide popover anchored to the right side of the token,
with a left-pointing arrow. Contains: HP +/− row, full condition palette (all system states,
toggle on/off), and compact stat chips. Flips to left side if near right viewport edge.

## Approach 2 — Modal (`approach-2-modal.html`)

A small ⚙ edit button appears on the selected token. Clicking it opens a centered modal
over a dimmed backdrop. The modal has: large HP bar + direct number inputs, a 5×2
condition grid with per-condition +/− level controls, and a full stats editor with
+/− per stat. Backdrop click or Escape closes.

## Approach 3 — Radial HUD (`approach-3-radial-hud.html`)

All interaction stays anchored to the token. On selection: the HP bar expands into an
interactive row (+/− flanking the bar), the full 8-slot ring appears (active = lit badge,
empty = ghost "+" for adding), and a row of stat chips appears below the token.
No separate window opens. Adding a condition shows a small floating palette from the "+" slot.

## Approach 4 — Radial HUD, on-token states (`approach-4-radial-hud-on-token.html`)

Variant of Approach 3 with two user-requested corrections:

1. **Non-selected token** — active conditions render as a compact icon strip **inside** the
   token (overlapping the avatar's lower edge), never radiating outward. This keeps every
   token's status inside its 50px footprint so tokens packed side by side don't blend together.
   Over ~3 active icons the strip collapses to `+N`.
2. **Selected token** — the full ring shows **every available condition at once**: active ones
   glow, unselected ones are greyed. Click a greyed slot to apply it, click a lit slot to remove
   it. The ring *is* the picker — no ghost "+" slot and no separate palette popup.

HP bar and stat chips behave exactly as in Approach 3. This is the recommended refinement of
Approach 3 — same speed, better readability on dense grids.

## Approach 5 — Radial HUD, numeric slots (`approach-5-radial-numeric.html`)

Variant of Approach 4 with two user-requested corrections:

1. **Non-selected token** — active conditions are shown on the radial ring (the "sun") at the
   **same fixed slot positions** they hold when selected — *not* collapsed into an on-token
   strip. Nothing shifts position when you select the token.
2. **Two of the eight slots are numeric value slots** (rounded squares) instead of on/off
   conditions. They always display a number (e.g. Armour, Ward) — visible even at rest for quick
   reference — and become editable (▲/▼ steppers or tap-to-type) when the token is selected.
   Shape encodes meaning: **round = condition (on/off)**, **rounded-square = numeric value**.

This is the most information-rich radial variant: persistent armour/ward readouts without
opening the token, plus the full toggle ring on selection.

## Approach 6 — On-token sun + expanding ring (`approach-6-radial-on-token-sun.html`)

Variant of Approach 5 with one correction:

- **Non-selected token** — active states *and* numbers sit ON the token as a small "sun"
  (compact radial cluster overlapping the avatar) at the same angular positions they hold when
  selected. On selection the sun **fans out** to the full ring around the token.

Progressive disclosure: `rest → sun on token` / `selected → full ring around token`. Keeps every
token self-contained at rest (no blending on dense grids) while still giving the full edit ring
on selection.

**Level up/down interaction** (answer to "how do you subtract a level?"): left-click an active
levelled state = +1 level; right-click / long-press = −1 (removes at 0); a small ▼ appears on
hover as a discoverable fallback.

---

## Comparison

| Criterion | Approach 1 · Popover | Approach 2 · Modal | Approach 3 · Radial HUD |
|---|---|---|---|
| **Screen space used** | Low–medium (238px panel to the right) | High (full overlay) | Minimal (everything around token) |
| **Combat edit speed** | Fast (one click, panel open) | Slow (two clicks to open + close) | Fastest (direct on-token taps) |
| **Map visibility** | Good (map under token stays clear) | Poor (map blocked by overlay) | Excellent (no separate surface) |
| **Information density** | Medium (can scroll if many states) | High (all data visible at once) | Low–medium (chips condensed) |
| **Overlap risk with nearby tokens** | None | None (floats above all) | Medium — rings can overlap on dense grids |
| **React implementation effort** | Medium (portal positioning, flip logic) | Low (standard modal, existing pattern) | High (radial layout, z-index management) |
| **Keyboard / accessibility** | Good (Tab through popover fields) | Best (standard modal focus trap) | Harder (radial elements need keyboard nav) |
| **Best context** | Mid-combat quick edits | Between-encounter deep editing | Fast-paced combat with experienced GMs |

---

## Recommendation

**Use Approach 3 as the primary in-combat interface + Approach 2 as the "full editor".**

Approach 3's radial HUD is the right default because the primary use case is live combat:
GMs need to adjust HP by 1–3 points and toggle a single condition without breaking
attention from the map. The HUD delivers that in one or two taps, zero modals.

Approach 2's modal is kept as the fallback detailed editor, accessible via:
- A small "⚙" button inside the Approach 3 HUD (below or inside the stat chips row), or
- A right-click / long-press context menu on the token.

This hybrid means Approach 3 covers 90% of combat interactions while Approach 2
handles edge cases (resetting all stats after a long rest, onboarding a new character,
adjusting many conditions at once).

**Approach 1 (popover)** is a viable simpler alternative if the Approach 3 ring
causes z-index or overlap issues in high-density scenes. It can be offered as a
user preference toggle ("compact HUD" vs "popover").

---

## Implementation notes for Approach 3

- State ring uses `position: absolute` slots computed from token center + radial offset.
  `r = 44px`, icon `22×22px`, 8 slots at `θ = -90° + n * 45°` (0 = top, clockwise).
- `overflow: visible` on the grid scene container; selected token group has `z-index: 100`.
- Non-selected neighbours: CSS class `.tok--neighbour` sets `opacity: 0.7` on their badge rings
  while any token is selected.
- Interactive HP row: replaces the always-visible thin bar. The thin bar re-appears on deselect.
- Stat chips: configurable array from `character.stats`; rendered as a flex row anchored below ring.
- State palette: renders via `createPortal` to `document.body` to avoid clipping.
  Positioned to the right of the clicked "+" slot (or left if near right edge).
