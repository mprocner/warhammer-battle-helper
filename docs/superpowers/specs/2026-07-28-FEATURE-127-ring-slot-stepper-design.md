# FEATURE-127 — Ring slot stepper collision

Numeric ring slots collide with their neighbours because the ▲/▼ stepper hangs outside the chip.
This spec replaces the always-visible hanging stepper with a stepper that is docked inside an
*active* chip, and pushes that chip radially outward while it is active.

## Problem

`TokenRingChrome.jsx` renders up to 8 slots around a selected token at 45° intervals, radius
`R = max(width, height) / 2 + RING_MARGIN`. A `number` slot that the viewer may edit renders
`NumberSlotInput` plus a stepper positioned **outside** the chip
(`.token-step { right: -13px; width: 12px }`).

Measured on the default 1-cell token (50px, `R = 42`):

| Quantity | Value |
|---|---|
| Worst neighbour pair | 0° (top) and 45° |
| Horizontal distance `dx = R·sin45°` | 29.7px |
| Vertical distance `dy = R·(1 − cos45°)` | 12.3px |
| Chip footprint (`min-width 22` + padding 4 + border 2) | 28px → ±14px |
| Footprint including the hanging stepper | +27px from chip centre |
| Neighbour's left edge | +15.7px |
| **Overlap** | **~11px** |

Two axes matter because collision is an AABB test: boxes overlap only when they overlap on *both*
axes. `dy = 12.3px` is below the 22px chip height, so the vertical axis already overlaps; the
stepper then breaks the horizontal axis too.

The collision affects every token below ~82px, i.e. the default token size. It applies to both
overlays, since `TokenOverlay` and `ImageTokenOverlay` share `TokenRingChrome`.

Secondary defect: `.token-slot__input` has a fixed `width: 22px`, so a 4-character value (`-999`)
is clipped.

## Decisions

1. **Steppers appear only on the active slot**, not on all slots at once.
2. **Active is a state, set by hover *and* by tap** — the app is used on tablets, where `:hover`
   either never fires or sticks after a tap.
3. **`RING_MARGIN` stays 17.** With steppers hidden at rest, a resting 28px chip fits inside the
   29.7px budget with 1.7px to spare.
4. **The active chip pushes radially outward**, rather than growing in place under a raised
   `z-index`. Pushing the top slot outward raises `dy` against its 45° neighbour from 12.3px to
   28.3px, which exceeds the summed half-heights (14 + 11 = 25px). Once one axis is clear, the
   chip's width no longer matters — the fix holds even if the font or padding changes later.
   Growing in place would leave ~4px masked by stacking order, which re-opens on any future
   metric change.
5. **The number input becomes width-adaptive**, from ~1 character up to today's 22px cap.

Rejected: enlarging `RING_MARGIN` (16px of extra radius, the most invasive option visually, and
unnecessary once steppers are hidden at rest); a symmetric `◄ 999 ►` pill (52px wide, overlaps
*both* neighbours to fix one collision).

## Layout

### Active-state metrics

| Property | Rest / selected-inactive | Active |
|---|---|---|
| Chip height | 22px | 28px |
| Chip width | adaptive, 10–28px | adaptive + 14px stepper, max 42px |
| Radial offset | `R` | `R + 16` |
| Stepper | not rendered | docked inside the right edge, 14px wide |
| Stepper button | — | 14×14px |

The push is 16px, not 14px: at 14px the clearance against a resting neighbour is 1.3px, which is
noise rather than a margin. At 16px it is 3.3px.

Active chip height is 28px so each stepper button is 14×14px, matching `.token-hp__btn` (15×15px).
This ring already trades ideal touch sizing for density everywhere (22px equator toggles, 15px HP
buttons); matching that established scale beats introducing a larger tap-target tier for one
control.

Only slots that actually render a stepper (editable `number` slots) grow and push. `field`,
`select` and read-only `number` chips keep their resting geometry.

### Clearances after the change

All values are measured from the token's centre unless stated otherwise, on a 50px token.

| Pair | Before | After | Margin |
|---|---|---|---|
| Active top slot vs 45° neighbour (`dy`) | 12.3px vs 25px needed | 28.3px | 3.3px |
| Active 45° slot vs top neighbour (`dx`) | — | 41px vs 35px needed | 6px |
| Active equator slot vs kill/gear toggle | 79px vs 69px (**overlap**) | 79px vs 83px | 4px |
| Active top slot vs character HP stack | −47px vs −44px (**overlap**) | −47px vs −50px | 3px |
| Active top slot vs image HP stack | −(R+30) vs −(R+16) (**overlap**) | −(R+30) vs −(R+34) | 4px |
| Active bottom slot vs `.token-squares` | 72px vs 105px | unchanged | 33px |
| Active bottom slot vs character name | 72px vs 79px | unchanged | 7px |

Two of these are new collisions introduced *by* the push and must be fixed in the same change:

- **Equator toggles.** Slots at 3 and 9 o'clock push horizontally, straight into the kill / eye /
  gear buttons at `equatorX = R + 38` (22px wide, so their inner edge is at `R + 27`). Fix:
  `EQUATOR_GAP 38 → 52`. Those buttons already sit outside the ring, so 14px further out is not a
  visible regression, and a single constant beats an angle-dependent push rule.

  Note that equator slots do not need the push for their *own* neighbours — the 45°/90° pair has
  `dy = 29.7px`, already above the 25px threshold. They inherit it only because the rule is
  uniform.

- **HP stacks.** The character stack sits at `top: -44px` from the token's top edge; a resting top
  slot's outer edge is at `-(RING_MARGIN + 11) = -28px` and an active one at
  `-(RING_MARGIN + 16 + 14) = -47px`. Both are independent of token size, because `halfLong`
  cancels — so a single value works for every token. Fix: `-44px → -50px`. The image stack is
  computed in JS (`HP_CLEAR = 16` in `ImageTokenOverlay.jsx:33`); fix: `16 → 34`.

  Cost: at rest the bars sit ~6px (characters) / ~18px (images) further from the token than today.
  Accepted, because the alternative — sliding the stack while a slot is active — couples two
  animations and reads as jumpy.

## Interaction

**State.** One `activeSlotId` lives in `TokenRingChrome`, not per-slot. Only one slot can be
active, so slot-to-slot movement can't race two independent booleans.

**Set active by:** `mouseenter` on the slot's hit-zone, tap / click on the hit-zone, or the input
receiving keyboard focus. All three feed the same state, so mouse and touch share one code path —
no `@media (hover: hover)` split is needed. Touch devices fire a synthetic `mouseenter` after a
tap, which lands on the same state the tap already set; the usual "sticky hover" problem is
neutralised by clearing explicitly on outside tap and on deselection rather than relying on
`mouseleave` alone.

**Clears on:** `mouseleave` of the hit-zone, tap or click outside the ring, and token deselection.
Deselection must clear via a `useEffect` keyed on `selected`; otherwise a stale `activeSlotId`
survives and the slot reappears already pushed out on the next selection.

**Focus wins over mouse-leave.** `NumberSlotInput` already tracks `focusedRef` internally to avoid
clobbering a mid-typed draft on WebSocket updates. Lift that signal out as an `onFocusChange`
callback so the ring computes `active = hovered || tapped || focused`. Without it, a GM who types a
value and then moves the mouse away has the chip collapse mid-edit.

**Hover flicker.** Moving a target under the cursor is a real hazard: chip moves away →
`mouseleave` → chip returns → `mouseenter` → loop. The fix is to decouple the hit-test from the
visual. Each slot renders a **static hit-zone** div at the slot's resting offset, sized to cover
the union of the resting box, the pushed-out box and the docked stepper (~44×52px). The hit-zone
carries all the pointer handlers and never moves; only the inner `.token-slot--num` translates.
The cursor therefore never leaves the hit-zone's bounding box during the transition, and the path
from chip centre to arrow is continuous — no dead gap to cross.

Transition: `transform .12s ease-out` on the way out, `.15s ease-in` on the way back. The existing
`.token-slot { transition: all .25s ease }` continues to own the rest/selected spread.

**Cursor.** `cursor: pointer` on `.token-slot__input` when it is not focused, `cursor: text` on
`:focus`. Pointer advertises "this is interactive" consistently with the rest of the ring, but once
the field is genuinely in edit mode a caret is the honest signal — the field is typeable, and
typing is the fast path for large jumps. Arrows keep `cursor: pointer` unconditionally. Clickable
`select` chips also gain `cursor: pointer`, which they lack today (icon slots already have it,
`style.css:10539`).

## Component changes

**`utils/tokenRingGeometry.js`**
- `EQUATOR_GAP: 38 → 52`.
- New exported `ACTIVE_PUSH = 16` and `ACTIVE_HALF_HEIGHT = 14`, so the HP clearance in
  `ImageTokenOverlay` is derived (`ACTIVE_PUSH + ACTIVE_HALF_HEIGHT + 4`) rather than a second
  magic number that can drift.
- `slotOffset` is unchanged — the active slot simply calls it with `radius + ACTIVE_PUSH`.

**`components/token-display/TokenRingChrome.jsx`**
- `useState` for `activeSlotId`; `useEffect` clearing it when `selected` goes false.
- `TokenSlot` gains `isActive` plus the static hit-zone wrapper for chip slots that can step.
- Steppers render only when `isActive`.
- One-line comment recording that icon slots deliberately do *not* get the active tier — they are
  single-click toggles with no stepper to keep clear of a neighbour.

**`components/token-display/NumberSlotInput.jsx`**
- New `onFocusChange` prop, fired from the existing `onFocus` / `onBlur` handlers.
- Width derived from the draft's length, clamped to 1–4 characters, applied as an inline style.
  The 4-character cap keeps the maximum at today's 22px, so the resting-chip budget is unchanged.

**`components/token-display/ImageTokenOverlay.jsx`**
- `HP_CLEAR` derived from the new geometry constants.

**`style.css`**
- `.token-slot--num` gains the active modifier (28px height, docked stepper, translate).
- The ring stepper reuses the docked pattern already proven by `.token-square`
  (`.token-step--sq`, `style.css:10593`) rather than a third variant.
- `.token-hp-stack--expanded { top: -44px → -50px }`.
- Cursor rules per the interaction section.

**Dead code removed in the same change** (project convention — no flag-and-leave):
- `.token-step`'s hanging offsets (`right: -13px; width: 12px`). The base class itself survives:
  `TokenOverlay.jsx:236` uses `token-step token-step--sq` for squares, and `--sq` only overrides
  those offsets.
- `.token-hp--expanded` (`style.css:10480`) and its `.token-hp__text` child rule — no consumer;
  both overlays use the stack classes.

## Testing

- Unit-test the geometry helper: active radius equals `R + 16`, and `EQUATOR_GAP` keeps the
  toggles clear of the widest active chip. `TokenHpBar.test.jsx` establishes that this folder is
  jsdom-testable.
- Unit-test `NumberSlotInput`'s adaptive width: 1, 3 and 4 characters produce increasing widths
  capped at the 4-character value, and a WebSocket-driven value change while focused does not
  resize mid-typing.
- Manual, on a 50px character token with all 8 ring positions filled with editable numbers set to
  `-999`: hover each slot in turn and confirm no overlap with either neighbour, with the kill /
  eye / gear toggles, or with the HP stack; confirm the chip does not flicker when the cursor
  rests on the boundary it just vacated; confirm typing then moving the mouse away keeps the chip
  open; confirm tap-to-open and tap-outside-to-close on a touch device or emulated touch.
- Repeat on a tokens-layer image, which shares the chrome but computes its HP offset in JS.

## Out of scope

- Redistributing slots evenly by occupancy (the 8 ring positions are addressable identities that
  the gear editor writes to; moving them would change what a position means).
- Any change to `RING_MARGIN`, squares, or the character-name offsets.
- Replacing the ▲▼ glyphs with MUI icons — `.token-square`'s steppers are glyph-based and stay
  that way.
