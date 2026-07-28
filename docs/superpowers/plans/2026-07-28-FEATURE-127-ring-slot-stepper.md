# FEATURE-127 — Ring Slot Stepper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the ▲/▼ stepper of a numeric ring slot from overlapping its neighbouring slots, by rendering the stepper only on the *active* slot, docked inside a chip that pushes 16px radially outward while active.

**Architecture:** `TokenRingChrome` gains two pieces of state (`hoverSlotId`, `focusSlotId`; active = focus ?? hover) and renders each chip slot inside a static hit-zone div that covers both the resting and the pushed-out chip position. Only the inner chip moves, so the pointer never leaves the element carrying the handlers. Geometry constants live in `utils/tokenRingGeometry.js` and are shared by both overlays.

**Tech Stack:** React 19, Create React App (`react-scripts` 5 → Jest + jsdom), `@testing-library/react`, plain BEM CSS in a single global `style.css`.

**Spec:** `docs/superpowers/specs/2026-07-28-FEATURE-127-ring-slot-stepper-design.md`

## Global Constraints

- Two components share `TokenRingChrome`: `TokenOverlay` (characters) and `ImageTokenOverlay` (scene images). Every change to the chrome must keep both working.
- No new i18n keys are needed; do not add hardcoded strings to JSX.
- No new icon libraries; ▲▼ stay as text glyphs, matching `.token-square`'s steppers.
- No MUI `<Tooltip>` — the existing `usePortalTooltip` stays as is.
- All CSS goes in `warhammer-battle-helper-front/src/style.css`, BEM naming, dark ring chrome on the light-cream palette.
- Dead code is removed in the same change that orphans it (project convention — no flag-and-leave).
- Tests run with `CI=true npx react-scripts test --watchAll=false` from `warhammer-battle-helper-front/`.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `warhammer-battle-helper-front/src/utils/tokenRingGeometry.js` | All ring metrics as named constants + `slotOffset` | Modify |
| `warhammer-battle-helper-front/src/utils/tokenRingGeometry.test.js` | Geometric invariants (no overlap after the push) | Create |
| `warhammer-battle-helper-front/src/components/token-display/NumberSlotInput.jsx` | Editable value: adaptive width + focus reporting | Modify |
| `warhammer-battle-helper-front/src/components/token-display/NumberSlotInput.test.jsx` | Width clamping + focus callback | Create |
| `warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx` | Active-slot state, hit-zone, docked stepper | Modify |
| `warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.test.jsx` | Active-state behaviour | Create |
| `warhammer-battle-helper-front/src/components/token-display/ImageTokenOverlay.jsx` | HP clearance derived from geometry | Modify |
| `warhammer-battle-helper-front/src/style.css` | Zone, active chip, cursors, HP clearance, dead-code removal | Modify |

---

### Task 1: Geometry constants

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/tokenRingGeometry.js`
- Modify: `warhammer-battle-helper-front/src/components/token-display/ImageTokenOverlay.jsx:11,33`
- Test: `warhammer-battle-helper-front/src/utils/tokenRingGeometry.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `ACTIVE_PUSH = 16`, `ACTIVE_HALF_HEIGHT = 14`, `ACTIVE_HALF_WIDTH = 21`, `HP_CLEAR = 34`, `EQUATOR_GAP = 52`, all named exports of `utils/tokenRingGeometry.js`. `slotOffset(i, radius)` and `tokenRingGeometry(width, height, selected)` keep their current signatures.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/utils/tokenRingGeometry.test.js`:

```js
import {
  tokenRingGeometry, slotOffset,
  ACTIVE_PUSH, ACTIVE_HALF_HEIGHT, ACTIVE_HALF_WIDTH, HP_CLEAR,
} from './tokenRingGeometry';

// Default 1-cell token. Every clearance below is measured on it, because the ring only
// runs out of room on small tokens (a token wider than ~82px never collided).
const TOKEN = 50;
const REST_HALF_HEIGHT = 11; // resting chip is 22px tall

test('the ring radius and equator gap are unchanged for the resting ring', () => {
  const { ringRadius, radius, equatorX } = tokenRingGeometry(TOKEN, TOKEN, true);
  expect(ringRadius).toBe(42);
  expect(radius).toBe(42);
  expect(equatorX).toBe(94);
});

test('an active top slot clears its 45-degree neighbour on the vertical axis', () => {
  const { radius } = tokenRingGeometry(TOKEN, TOKEN, true);
  const active = slotOffset(0, radius + ACTIVE_PUSH); // pushed-out top slot
  const neighbour = slotOffset(1, radius);            // resting 45-degree slot

  // Boxes collide only when they overlap on BOTH axes, so one clear axis is enough.
  const dy = Math.abs(neighbour.y - active.y);
  expect(dy).toBeGreaterThan(ACTIVE_HALF_HEIGHT + REST_HALF_HEIGHT);
});

test('an active 45-degree slot clears the top slot on the horizontal axis', () => {
  const { radius } = tokenRingGeometry(TOKEN, TOKEN, true);
  const active = slotOffset(1, radius + ACTIVE_PUSH);
  const neighbour = slotOffset(0, radius);

  const dx = Math.abs(neighbour.x - active.x);
  expect(dx).toBeGreaterThan(ACTIVE_HALF_WIDTH + 14); // 14 = half of the widest resting chip
});

test('an active equator slot clears the kill and gear toggles', () => {
  const { radius, equatorX } = tokenRingGeometry(TOKEN, TOKEN, true);
  const chipOuterEdge = radius + ACTIVE_PUSH + ACTIVE_HALF_WIDTH;
  const toggleInnerEdge = equatorX - 11; // toggles are 22px wide

  expect(toggleInnerEdge).toBeGreaterThan(chipOuterEdge);
});

test('the HP clearance leaves the pushed-out top slot room', () => {
  // HP stacks sit HP_CLEAR beyond the ring; the pushed chip reaches ACTIVE_PUSH + its half height.
  expect(HP_CLEAR).toBeGreaterThan(ACTIVE_PUSH + ACTIVE_HALF_HEIGHT);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false --testPathPattern=tokenRingGeometry`
Expected: FAIL — `equatorX` is 80 (not 94), and `ACTIVE_PUSH` / `ACTIVE_HALF_HEIGHT` / `ACTIVE_HALF_WIDTH` / `HP_CLEAR` are `undefined`.

- [ ] **Step 3: Add the constants**

Replace the constant block at the top of `warhammer-battle-helper-front/src/utils/tokenRingGeometry.js` (currently lines 5-7):

```js
export const RING_MARGIN = 17; // slots sit ~17px beyond the token edge (25 + 17 = 42 at 50px)
export const REST_FACTOR = 0.68; // sun-at-rest radius as a fraction of half the long side
// Equator toggles (kill / eye / gear) sit this far beyond the ring. 52 rather than a tighter
// value because an ACTIVE equator slot pushes ACTIVE_PUSH outward and is ACTIVE_HALF_WIDTH wide,
// so its outer edge reaches ringRadius + 37 — the toggles must start beyond that.
export const EQUATOR_GAP = 52;

// An active (hovered / tapped / focused) number slot grows to fit a docked stepper and pushes
// outward along its own ring angle. Pushing raises the vertical distance to the 45-degree
// neighbour above the summed half-heights, which makes the chip's width irrelevant — boxes
// collide only when they overlap on both axes.
export const ACTIVE_PUSH = 16;        // radial offset of the active chip
export const ACTIVE_HALF_HEIGHT = 14; // half of the 28px active chip
export const ACTIVE_HALF_WIDTH = 21;  // half of the widest active chip (22 input + 6 chrome + 14 stepper)
// HP stacks sit this far beyond the ring, i.e. clear of an active top slot with 4px to spare.
export const HP_CLEAR = ACTIVE_PUSH + ACTIVE_HALF_HEIGHT + 4;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false --testPathPattern=tokenRingGeometry`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point ImageTokenOverlay at the shared constant**

In `warhammer-battle-helper-front/src/components/token-display/ImageTokenOverlay.jsx`, delete the local constant on line 11:

```js
const HP_CLEAR = 16; // HP stack's bottom edge sits this far beyond the top ring slot
```

and add `HP_CLEAR` to the existing geometry import on line 6:

```js
import { tokenRingGeometry, HP_CLEAR } from '../../utils/tokenRingGeometry';
```

Line 33 (`const hpTransform = ...`) stays exactly as it is — it already reads `HP_CLEAR`.

- [ ] **Step 6: Verify nothing else defines or shadows HP_CLEAR**

Run: `cd warhammer-battle-helper-front/src && grep -rn "HP_CLEAR" .`
Expected: three hits only — the export in `utils/tokenRingGeometry.js`, the import in `ImageTokenOverlay.jsx`, and its use on line 33.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/tokenRingGeometry.js \
        warhammer-battle-helper-front/src/utils/tokenRingGeometry.test.js \
        warhammer-battle-helper-front/src/components/token-display/ImageTokenOverlay.jsx
git commit -m "feat(scene): FEATURE-127 ring geometry constants for the active slot"
```

---

### Task 2: Adaptive-width number input

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/token-display/NumberSlotInput.jsx`
- Test: `warhammer-battle-helper-front/src/components/token-display/NumberSlotInput.test.jsx` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `NumberSlotInput` accepts a new optional prop `onFocusChange(focused: boolean)`, called with `true` on focus and `false` on blur (after the existing commit). The rendered `<input>` carries an inline `style.width` of `"9px"` … `"22px"`.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/token-display/NumberSlotInput.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import NumberSlotInput from './NumberSlotInput';

test('the width grows with the digit count', () => {
  const { container, rerender } = render(<NumberSlotInput value={5} onCommit={() => {}} />);
  const narrow = container.querySelector('input').style.width;

  rerender(<NumberSlotInput value={999} onCommit={() => {}} />);
  const wide = container.querySelector('input').style.width;

  expect(parseFloat(narrow)).toBeLessThan(parseFloat(wide));
});

test('the width is capped at the four-character value, so the resting chip stays 28px', () => {
  const { container, rerender } = render(<NumberSlotInput value={-999} onCommit={() => {}} />);
  const fourChars = container.querySelector('input').style.width;

  rerender(<NumberSlotInput value={-99999} onCommit={() => {}} />);
  const sixChars = container.querySelector('input').style.width;

  expect(fourChars).toBe('22px');
  expect(sixChars).toBe('22px');
});

test('reports focus and blur to the caller', () => {
  const seen = [];
  const { container } = render(
    <NumberSlotInput value={5} onCommit={() => {}} onFocusChange={(f) => seen.push(f)} />
  );
  const input = container.querySelector('input');

  fireEvent.focus(input);
  fireEvent.blur(input);

  expect(seen).toEqual([true, false]);
});

test('a live value update does not resize the field while it is being typed in', () => {
  const { container, rerender } = render(<NumberSlotInput value={5} onCommit={() => {}} />);
  const input = container.querySelector('input');

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '7' } });
  rerender(<NumberSlotInput value={12345} onCommit={() => {}} />); // WebSocket update mid-typing

  expect(input.value).toBe('7');
  expect(input.style.width).toBe('9px');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false --testPathPattern=NumberSlotInput`
Expected: FAIL — `style.width` is `""` (the width lives in CSS today) and `onFocusChange` is never called.

- [ ] **Step 3: Implement**

Replace the whole of `warhammer-battle-helper-front/src/components/token-display/NumberSlotInput.jsx`:

```jsx
import React, { useEffect, useRef, useState } from 'react';

// Width of one character at `800 9px Georgia`, plus room for the caret. Four characters ("-999")
// land on 22px, which is exactly the width this field used to be fixed at — so the widest chip is
// no wider than before and the resting ring keeps its clearance. Shorter values simply take less.
const CHAR_WIDTH = 4.5;
const PADDING = 4;
const MIN_CHARS = 1;
const MAX_CHARS = 4;

function widthFor(text) {
  const chars = Math.min(MAX_CHARS, Math.max(MIN_CHARS, String(text).length));
  return `${PADDING + Math.round(chars * CHAR_WIDTH)}px`;
}

// Editable value for a number ring slot: shown when the token is selected and the viewer can edit.
// Typing + Enter (or blur) commits an absolute value via onCommit — much faster than the ▲/▼
// steppers for jumping to e.g. 20. Escape reverts. Used by both TokenOverlay and ImageTokenOverlay.
// `onFocusChange` lets the ring keep the slot open while it is being typed in, even if the pointer
// has wandered off the chip.
export default function NumberSlotInput({ value, onCommit, onFocusChange, className = 'token-slot__input' }) {
  const [draft, setDraft] = useState(String(value ?? 0));
  const focusedRef = useRef(false);

  // Keep in sync with live (WS) updates, but never clobber what the GM is mid-typing.
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value ?? 0));
  }, [value]);

  const commit = () => {
    const n = parseFloat(draft);
    if (!Number.isNaN(n) && n !== (value ?? 0)) onCommit(n);
    else setDraft(String(value ?? 0)); // revert empty/invalid/unchanged
  };

  return (
    <input
      type="number"
      className={className}
      style={{ width: widthFor(draft) }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => { focusedRef.current = true; e.target.select(); if (onFocusChange) onFocusChange(true); }}
      onBlur={() => { focusedRef.current = false; commit(); if (onFocusChange) onFocusChange(false); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        // Enter/Escape just blur; the single commit (or revert) happens in onBlur.
        if (e.key === 'Enter') { e.currentTarget.blur(); }
        else if (e.key === 'Escape') { setDraft(String(value ?? 0)); e.currentTarget.blur(); }
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false --testPathPattern=NumberSlotInput`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/token-display/NumberSlotInput.jsx \
        warhammer-battle-helper-front/src/components/token-display/NumberSlotInput.test.jsx
git commit -m "feat(scene): FEATURE-127 adaptive-width number slot input"
```

---

### Task 3: Active slot state, hit-zone and docked stepper

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx:1-9` (imports), `:56-91` (`TokenSlot`), `:93-168` (`TokenRingChrome`)
- Modify: `warhammer-battle-helper-front/src/style.css` (add the zone + active chip rules)
- Test: `warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.test.jsx` (create)

**Interfaces:**
- Consumes: `ACTIVE_PUSH` and `slotOffset` from `utils/tokenRingGeometry.js` (Task 1); `NumberSlotInput`'s `onFocusChange` prop (Task 2).
- Produces: chip slots render as `.token-slot-zone > .token-slot--num`; the stepper markup is `.token-step.token-step--sq`, identical to `.token-square`'s. `TokenRingChrome`'s public props are unchanged — neither overlay needs editing.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import TokenRingChrome from './TokenRingChrome';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));

const editableSlot = (over = {}) => ({
  id: 'slot-1', variant: 'chip', value: 5, cap: 'AMMO', showAtRest: true,
  editable: true, numberValue: 5, onSetNumber: () => {}, onStep: () => {}, ...over,
});

const renderRing = (slots, props = {}) => render(
  <TokenRingChrome selected canEdit radius={42} equatorX={94} slots={slots}
    killStrikeClassName="token-kill-strike" killToggleClassName="token-kill-toggle"
    onToggleKilled={() => {}} {...props} />
);

test('an editable chip shows no stepper until it becomes active', () => {
  const { container } = renderRing([editableSlot()]);
  expect(container.querySelector('.token-step')).toBeNull();
});

test('hovering the hit-zone reveals the stepper and releasing hides it again', () => {
  const { container } = renderRing([editableSlot()]);
  const zone = container.querySelector('.token-slot-zone');

  fireEvent.mouseEnter(zone);
  expect(container.querySelectorAll('.token-step--sq button')).toHaveLength(2);

  fireEvent.mouseLeave(zone);
  expect(container.querySelector('.token-step')).toBeNull();
});

test('only one slot is active at a time', () => {
  const { container } = renderRing([editableSlot(), editableSlot({ id: 'slot-2' })]);
  const [first, second] = container.querySelectorAll('.token-slot-zone');

  fireEvent.mouseEnter(first);
  fireEvent.mouseLeave(first);
  fireEvent.mouseEnter(second);

  expect(container.querySelectorAll('.token-slot-zone.is-active')).toHaveLength(1);
  expect(second.className).toContain('is-active');
});

test('a focused field keeps the slot open after the pointer leaves', () => {
  const { container } = renderRing([editableSlot()]);
  const zone = container.querySelector('.token-slot-zone');

  fireEvent.mouseEnter(zone);
  fireEvent.focus(container.querySelector('.token-slot__input'));
  fireEvent.mouseLeave(zone);

  expect(container.querySelector('.token-step--sq')).not.toBeNull();
});

test('deselecting the token clears the active slot', () => {
  const { container, rerender } = renderRing([editableSlot()]);
  fireEvent.mouseEnter(container.querySelector('.token-slot-zone'));

  rerender(
    <TokenRingChrome selected={false} canEdit radius={42} equatorX={94} slots={[editableSlot()]}
      killStrikeClassName="token-kill-strike" killToggleClassName="token-kill-toggle"
      onToggleKilled={() => {}} />
  );

  expect(container.querySelector('.token-slot-zone.is-active')).toBeNull();
});

test('a read-only chip gets no hit-zone handlers and never opens a stepper', () => {
  const { container } = renderRing([{ id: 'ro', variant: 'chip', value: 3, cap: 'WS', showAtRest: true }]);
  fireEvent.mouseEnter(container.querySelector('.token-slot-zone'));
  expect(container.querySelector('.token-step')).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false --testPathPattern=TokenRingChrome`
Expected: FAIL — there is no `.token-slot-zone` element, so `fireEvent.mouseEnter(null)` throws, and the first test fails because the stepper renders unconditionally.

- [ ] **Step 3: Update the imports**

In `warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx`, change line 1 and line 9:

```jsx
import React, { useEffect, useState } from 'react';
```

```jsx
import { slotOffset, ACTIVE_PUSH } from '../../utils/tokenRingGeometry';
```

- [ ] **Step 4: Replace `TokenSlot`**

Replace the whole `TokenSlot` function (lines 53-91, comment included) with:

```jsx
// One ring slot. `slot` is normalized: { variant:'icon'|'chip', showAtRest, ... }. `index` is the
// slot's position in the original config array (drives the ring angle), so callers must keep empty
// slots as null placeholders rather than filtering them out.
//
// A chip that can step (an editable number) needs room for a stepper, which does not fit between
// two neighbouring slots — so it only appears while the slot is active, and the chip pushes
// ACTIVE_PUSH outward along its ring angle to make space. Two consequences shape the markup:
//   - the handlers live on `.token-slot-zone`, a wrapper that does NOT move, so the chip sliding
//     out from under the pointer cannot trigger a mouseleave → mouseenter flicker loop;
//   - the zone is centred halfway along the push, so it covers both chip positions.
// Icon slots deliberately skip all of this: they are single-click toggles with no stepper to fit.
function TokenSlot({ slot, index, radius, selected, isActive, onHoverChange, onFocusChange, showTooltip, hideTooltip }) {
  if (!selected && !slot.showAtRest) return null;
  const off = slotOffset(index, radius);

  if (slot.variant === 'icon') {
    const posStyle = { left: '50%', top: '50%', transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` };
    const Ico = slot.Icon;
    return (
      <div className={`token-slot token-slot--icon ${slot.active ? 'is-active' : 'is-inactive'}`}
        style={posStyle}
        onMouseEnter={slot.label ? (e) => showTooltip(slot.label, e.currentTarget) : undefined}
        onMouseLeave={slot.label ? hideTooltip : undefined}
        onClick={(e) => { if (selected) { e.stopPropagation(); slot.onBump(+1); } }}
        onContextMenu={(e) => { if (!selected) return; e.preventDefault(); e.stopPropagation(); slot.onBump(-1); }}>
        {Ico ? <Ico sx={{ fontSize: selected ? 14 : 11 }} /> : '?'}
        {slot.active && slot.level > 1 && <span className="token-slot__level">{slot.level}</span>}
      </div>
    );
  }

  const canStep = !!slot.editable && !!slot.onStep;
  const push = isActive && canStep ? ACTIVE_PUSH : 0;
  const dir = slotOffset(index, 1); // unit vector along this slot's ring angle
  const zone = { x: off.x + (dir.x * push) / 2, y: off.y + (dir.y * push) / 2 };
  const chipDx = (dir.x * push) / 2; // chip sits at the far end of the zone while active
  const chipDy = (dir.y * push) / 2;
  const clickable = selected && (canStep || !!slot.onClick);

  return (
    <div className={`token-slot-zone ${isActive ? 'is-active' : ''}`}
      style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${zone.x}px), calc(-50% + ${zone.y}px))` }}
      onMouseEnter={canStep ? () => onHoverChange(true) : undefined}
      onMouseLeave={canStep ? () => onHoverChange(false) : undefined}
      onClick={canStep ? () => onHoverChange(true) : undefined}>
      <div className={`token-slot token-slot--num ${isActive ? 'is-active' : ''} ${clickable ? 'is-clickable' : ''}`}
        style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${chipDx}px), calc(-50% + ${chipDy}px))` }}
        title={slot.cap || ''}
        onClick={(e) => { if (selected && slot.onClick) { e.stopPropagation(); slot.onClick(); } }}>
        {slot.editable
          ? <NumberSlotInput value={slot.numberValue} onCommit={slot.onSetNumber} onFocusChange={onFocusChange} />
          : <span className="token-slot__val">{slot.value ?? '–'}</span>}
        {slot.cap && <span className="token-slot__cap">{slot.cap}</span>}
        {isActive && canStep && (
          <div className="token-step token-step--sq">
            <button onClick={(e) => { e.stopPropagation(); slot.onStep(+1); }}>▲</button>
            <button onClick={(e) => { e.stopPropagation(); slot.onStep(-1); }}>▼</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the active-slot state to `TokenRingChrome`**

Immediately after the two existing hook calls in `TokenRingChrome` (`const { t } = ...` and `const { showTooltip, ... } = ...`), add:

```jsx
  // Which slot shows its stepper. Hover and focus are tracked separately so that typing a value
  // and then moving the pointer away does not collapse the chip mid-edit, and so that blurring
  // the field while still hovering leaves it open. Touch sets the hover id via the zone's onClick.
  const [hoverSlotId, setHoverSlotId] = useState(null);
  const [focusSlotId, setFocusSlotId] = useState(null);
  const activeSlotId = focusSlotId ?? hoverSlotId;

  // Deselecting must clear both, or a stale id makes the slot reappear already pushed out.
  useEffect(() => {
    if (!selected) { setHoverSlotId(null); setFocusSlotId(null); }
  }, [selected]);
```

- [ ] **Step 6: Pass the state down**

Replace the `slots.map(...)` block (currently lines 158-161):

```jsx
      {slots.map((slot, i) => slot == null ? null : (
        <TokenSlot key={slot.id} slot={slot} index={i} radius={radius}
          selected={selected} isActive={activeSlotId === slot.id}
          onHoverChange={(on) => setHoverSlotId(on ? slot.id : null)}
          onFocusChange={(on) => setFocusSlotId(on ? slot.id : null)}
          showTooltip={showTooltip} hideTooltip={hideTooltip} />
      ))}
```

- [ ] **Step 7: Add the zone and active-chip CSS**

In `warhammer-battle-helper-front/src/style.css`, immediately after the `.token-slot { ... }` block (currently ending on line 10531), insert:

```css
/* Hover target for a chip slot. It never moves — only the chip inside it does — so a chip that
   slides outward cannot escape the pointer and start a leave/enter loop. At rest it is barely
   larger than the chip; while active it grows to cover the pushed-out position too. */
.token-slot-zone {
  position: absolute;
  width: 30px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.token-overlay--selected .token-slot-zone { pointer-events: auto; }
.token-slot-zone.is-active { width: 46px; height: 46px; z-index: 12; }
```

Then extend the number-chip rules (currently lines 10547-10552). First lower the selected chip's
floor so the adaptive input width actually shows — `min-width: 22px` would otherwise pin every
chip to its widest form:

```css
.token-overlay--selected .token-slot--num { min-width: 14px; height: 22px; }
```

```css
/* Active chip: 28px tall so each docked stepper button is 14x14, matching .token-hp__btn's
   established 15px affordance; padding-right reserves the stepper column. */
.token-slot--num.is-active {
  height: 28px; padding-right: 14px;
  transition: transform .12s ease-out, height .12s ease-out;
  z-index: 1;
}
.token-slot--num:not(.is-active) { transition: transform .15s ease-in, height .15s ease-in; }
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false --testPathPattern=TokenRingChrome`
Expected: PASS — 6 tests in `TokenRingChrome.test.jsx` plus the 3 existing ones in `TokenHpBar.test.jsx`.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.jsx \
        warhammer-battle-helper-front/src/components/token-display/TokenRingChrome.test.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "feat(scene): FEATURE-127 stepper docks inside the active ring slot"
```

---

### Task 4: Clearances, cursors and dead code

**Files:**
- Modify: `warhammer-battle-helper-front/src/style.css:10466-10485` (HP stack), `:10554-10574` (input, stepper base)

**Interfaces:**
- Consumes: the `.token-slot-zone` / `.is-active` classes from Task 3.
- Produces: nothing other tasks read.

- [ ] **Step 1: Raise the character HP stack clear of the pushed-out top slot**

In `.token-hp-stack--expanded` (line 10467), change `top: -44px` to:

```css
.token-hp-stack--expanded {
  /* -50 not -44: an ACTIVE top slot reaches RING_MARGIN + ACTIVE_PUSH + 14 = 47px above the
     token's top edge. halfLong cancels out of that sum, so one value holds for every token size. */
  top: -50px;
  width: 88px;
}
```

- [ ] **Step 2: Delete the orphaned expanded-bar rule**

Delete lines 10480-10485 entirely:

```css
.token-hp--expanded {
  /* Raised clear of the ring's top slots (their outer edge sits ~-53px from centre). */
  top: -50px;
  width: 88px;
  height: 15px;
}
```

Both overlays render `.token-hp-stack` / `.img-token-hp-stack`; nothing sets `token-hp--expanded`.

- [ ] **Step 3: Verify the deletion is safe**

Run: `cd warhammer-battle-helper-front/src && grep -rn "token-hp--expanded" .`
Expected: exactly one hit — the stale comment in the image-token section (`style.css:10702-10703`). Update that comment to drop the reference:

```css
/* .token-hp__text is 6px by default; bump it here when the stack is expanded to match the
   character bar. */
```

- [ ] **Step 4: Strip the hanging offsets from the stepper base class**

Replace `.token-step` (lines 10566-10569). The base now carries only what both users share; every consumer supplies its own docking via `--sq`.

```css
/* Stepper column. Both users (ring chips and squares) dock it inside the host's right edge via
   .token-step--sq; the base only owns the layout. */
.token-step {
  position: absolute;
  display: flex; flex-direction: column;
}
```

- [ ] **Step 5: Add the cursor rules**

Replace the `.token-slot__input` block (lines 10557-10562) and append the chip rule:

```css
.token-slot__input {
  width: 22px; border: none; background: transparent; text-align: center;
  font: 800 9px/1 Georgia, serif; color: #2a1f12; padding: 0; margin: 0;
  pointer-events: auto; -moz-appearance: textfield;
  /* Pointer while idle, matching every other interactive part of the ring; a caret once the field
     is genuinely in edit mode, because there a click places an insertion point rather than firing
     an action. The inline style from NumberSlotInput overrides the width above. */
  cursor: pointer;
}
.token-slot__input:focus { outline: none; cursor: text; }
```

```css
.token-overlay--selected .token-slot--num.is-clickable { cursor: pointer; }
```

- [ ] **Step 6: Run the full frontend suite**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --watchAll=false`
Expected: PASS — all suites, including `fileUrl.test.js`, `Avatar.test.js`, `TokenHpBar.test.jsx` and the three added here.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/style.css
git commit -m "fix(scene): FEATURE-127 HP clearance, slot cursors, drop dead ring CSS"
```

---

### Task 5: Manual verification in the running app

**Files:** none — this task produces evidence, not code.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: a written pass/fail note per check, pasted into the final report.

- [ ] **Step 1: Start the stack**

Run the project's usual local stack (`docker compose up -d` at the repo root, then `npm start` in `warhammer-battle-helper-front/` if the front end is not containerised). Log in as GM and open a scene with at least one placed character token at default (1-cell) size.

- [ ] **Step 2: Set up the worst case**

Open the token's gear panel and fill all 8 ring positions with `number` slots. Set every value to `-999`. This is the maximum-width case the geometry was sized for.

- [ ] **Step 3: Check each slot in turn**

Select the token, then hover each of the 8 slots one at a time. For each, confirm:
- the chip slides outward and shows ▲▼ docked inside its right edge;
- it does not overlap either neighbouring chip;
- the 3 o'clock and 9 o'clock slots do not touch the skull / eye / gear buttons;
- the 12 o'clock slot does not touch the HP bars.

- [ ] **Step 4: Check for flicker**

Park the pointer near the inner edge of a slot and hold it still. The chip must not oscillate open/closed. Move slowly across the boundary between two neighbouring slots — exactly one should be open at any moment.

- [ ] **Step 5: Check the edit paths**

Click into a field, type `250`, press Enter — the value commits. Type into a field and then move the pointer off the token — the chip must stay open. Click ▲ and ▼ — the value steps and the change reaches other clients (check a second browser session).

- [ ] **Step 6: Check touch**

In browser devtools, switch to a touch-emulating device profile. Tap a slot — the stepper appears. Tap ▲ — the value steps. Tap another slot — the first closes. Tap empty map to deselect — no slot stays open.

- [ ] **Step 7: Repeat on an image token**

Place an image on the tokens layer, configure numeric slots on it, and repeat steps 3-5. It shares `TokenRingChrome` but computes its HP offset in JS, so its bar clearance is a separate code path.

- [ ] **Step 8: Report**

Write the result of each check into the final report. If any check fails, stop and report the failure rather than adjusting constants ad hoc — the geometry in the spec is derived, so a failure means a derivation is wrong and the spec needs updating first.

---

## Notes for the implementer

- **Why the push, not a bigger ring:** with steppers hidden at rest, a resting 28px chip already fits the 29.7px budget between neighbours. Enlarging `RING_MARGIN` would move every slot for a problem that only exists while one slot is active.
- **Why one clear axis is enough:** two boxes collide only if they overlap on *both* the x and y axis. The top/45° pair is separated by 29.7px horizontally but only 12.3px vertically, so its vertical axis is the one under pressure — and the radial push for a top slot is straight up, which is exactly the axis that needs the room. The same push applied at 3 o'clock is horizontal and buys nothing for that slot's own neighbours; it is applied uniformly for simplicity, which is why `EQUATOR_GAP` had to grow.
- **Do not "improve" the resting chip's height.** The clearance arithmetic assumes the *neighbour* stays 22px tall (11px half-height). Changing that invalidates every number in the spec's clearance table.
