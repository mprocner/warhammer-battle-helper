# PLAYRPG-241 Field Row Heights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the custom character sheet, fields get a type-based height (1 or 2 grid rows), so two text fields can stack beside one avatar and attributes match text/avatar heights.

**Architecture:** A pure function `fieldRowSpan(field)` maps field type to `1 | 2 | null`. `CustomSheetBody` wraps every field of a section in one cell element (`custom-sheet__cell custom-sheet__cell--rows-N`); in the creator the chrome wrapper `custom-sheet__editable` is put on that same element, so the grid tree is identical in game and creator. CSS grid uses a row unit (`grid-auto-rows: minmax(unit, auto)`, `align-items: start`), and `--rows-2` cells span two rows. The creator's drop geometry (`utils/sheetDnd.js`) clips row bottoms so a spanning cell no longer makes rows overlap.

**Tech Stack:** React (CRA), Jest + Testing Library (jsdom), plain CSS in `src/style.css`.

**Spec:** `docs/superpowers/specs/PLAYRPG-241.md`

## Global Constraints

- Height is derived from the field type only. No template model change, no backend change.
- Span table: `2` = `char_avatar`, `text_long`, `attr` with `hasAdvances`; `1` = `text_short`, `char_name`, `number`, `computed`, `progress`, `select`, `checkbox`, `label`, `attr` without `hasAdvances`; `null` = everything else (`image`, `skill_table`, `weapons_table`, `skill_tree`, `section`, unknown).
- No `grid-auto-flow: dense` — model order stays auto-placement order.
- 1-column sections stay `display: flex; flex-direction: column`.
- Root sections (children of `.custom-sheet__sections`) get no cell wrapper.
- Code comments in English. No hardcoded UI strings (this feature adds none).
- New CSS rules that modify a base rule must be declared AFTER that base rule in `style.css` (cascade-order trap) and use selectors at least as specific as the base.
- Run frontend tests from `warhammer-battle-helper-front/`: `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Never bare `npx jest`. `App.test.js` (axios ESM) is a known baseline failure.
- Work on `main` (no worktree). Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj
  ```
- Never stage `warhammer-battle-helper-front/nginx.conf` or `package-lock.json` (user's unrelated local changes). Stage files by explicit path.

## File Structure

- Create `warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.js` — the span table, single source of truth.
- Create `warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.test.js`.
- Modify `warhammer-battle-helper-front/src/utils/sheetDnd.js` — `rowsOf` clips row bottoms.
- Modify `warhammer-battle-helper-front/src/utils/sheetDnd.test.js` — spanning-cell cases.
- Modify `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` — `withChrome` gains a cell class; `renderSection` passes it.
- Create `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.rowSpan.test.jsx`.
- Modify `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.tiles.test.jsx` — selector goes through the cell.
- Modify `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx` + its snapshot — cell is now the grid child.
- Modify `warhammer-battle-helper-front/src/style.css` — row unit, cell rules, avatar size, compact solo attr, text_long fill, centred select/checkbox/label.

---

### Task 1: `fieldRowSpan` — the span table

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.js`
- Test: `warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.test.js`

**Interfaces:**
- Produces: `export function fieldRowSpan(field): 1 | 2 | null` (named export). Task 3 imports it.

- [ ] **Step 1: Write the failing test**

`warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.test.js`:

```js
import { fieldRowSpan } from './fieldRowSpan';

describe('fieldRowSpan', () => {
  test.each([
    ['char_avatar', 2],
    ['text_long', 2],
    ['text_short', 1],
    ['char_name', 1],
    ['number', 1],
    ['computed', 1],
    ['progress', 1],
    ['select', 1],
    ['checkbox', 1],
    ['label', 1],
    ['image', null],
    ['skill_table', null],
    ['weapons_table', null],
    ['skill_tree', null],
    ['section', null],
    ['something_new', null],
  ])('%s spans %p', (type, expected) => {
    expect(fieldRowSpan({ key: 'k', type })).toBe(expected);
  });

  test('an attribute with advances spans two rows', () => {
    expect(fieldRowSpan({ key: 'ws', type: 'attr', hasAdvances: true })).toBe(2);
  });

  test('an attribute without advances spans one row', () => {
    expect(fieldRowSpan({ key: 'ws', type: 'attr' })).toBe(1);
    expect(fieldRowSpan({ key: 'ws', type: 'attr', hasAdvances: false })).toBe(1);
  });

  test('a missing field has no span', () => {
    expect(fieldRowSpan(null)).toBeNull();
    expect(fieldRowSpan(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `warhammer-battle-helper-front/`): `CI=true npm test -- --watchAll=false --testPathPattern=fieldRowSpan`
Expected: FAIL — `Cannot find module './fieldRowSpan'`.

- [ ] **Step 3: Write minimal implementation**

`warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.js`:

```js
// fieldRowSpan says how many rows of the section grid a field occupies (PLAYRPG-241).
//
// The unit is one text tile. A field of 2 is as tall as two text tiles plus the gap between
// them, which is what lets a GM stack two short fields beside one avatar. `null` means the
// field's height follows its content (tables, free images, nested sections): those cannot be
// quantised without measuring them, and the sheet deliberately does no layout measurement.
//
// The span is derived from the type alone, never stored on the template, so changing this
// table re-lays out every existing sheet and there is nothing to migrate.
const TWO_ROWS = new Set(['char_avatar', 'text_long']);
const ONE_ROW = new Set([
  'text_short', 'char_name', 'number', 'computed', 'progress', 'select', 'checkbox', 'label',
]);

export function fieldRowSpan(field) {
  if (!field) return null;
  // An attribute with advances shows base + advances beside its total; without them it is a
  // single number, as compact as any other value tile.
  if (field.type === 'attr') return field.hasAdvances ? 2 : 1;
  if (TWO_ROWS.has(field.type)) return 2;
  if (ONE_ROW.has(field.type)) return 1;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=fieldRowSpan`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.js warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.test.js
git commit -m "feat: PLAYRPG-241 derive a field's grid row span from its type

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 2: Drop geometry tolerates a cell spanning two rows

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/sheetDnd.js` (function `rowsOf`, ~lines 55–67)
- Test: `warhammer-battle-helper-front/src/utils/sheetDnd.test.js`

**Interfaces:**
- Consumes: nothing from Task 1. Uses the existing `GAP` constant in `sheetDnd.js`.
- Produces: no new exports; `insertionAt` behaviour changes only when a cell reaches below the next row's top.

Background: `rowsOf` groups children by `top` and sets each row's `bottom` to the max bottom of its cells. A cell spanning two grid rows starts in row 1 and ends at the bottom of row 2, so row 1's band covers row 2 and `indexInContainer` picks the wrong row. The fix clips each row's bottom at `nextRow.top - GAP`. For ordinary rows the grid already guarantees `maxBottom <= nextTop - GAP`, so nothing changes for them.

- [ ] **Step 1: Write the failing tests**

Append to `warhammer-battle-helper-front/src/utils/sheetDnd.test.js` (the file already defines `r` and imports `insertionAt`):

```js
// PLAYRPG-241: a two-column section whose second field spans two grid rows.
//   [ text1 ][ avatar ]
//   [ text2 ][ avatar ]
// Row unit 59px, gap 8px, so the avatar is 2 * 59 + 8 = 126px tall.
const spanTree = () => ([
  { path: [0],    rect: r(0, 0, 300, 200), container: true },
  { path: [0, 0], rect: r(10, 20, 136, 59), container: false },
  { path: [0, 1], rect: r(154, 20, 136, 126), container: false },
  { path: [0, 2], rect: r(10, 87, 136, 59), container: false },
]);

describe('insertionAt — a cell spanning two rows', () => {
  test('the gap beside the lower field belongs to the lower row', () => {
    // x = 149 is in the column gap (146..154), y = 110 is level with text2. Without clipping,
    // row 1 reaches down to the avatar's bottom and the pointer is matched against text1.
    expect(insertionAt({ x: 149, y: 110 }, spanTree())).toEqual({ parentPath: [0], index: 3 });
  });

  test('between the two stacked fields it inserts before the lower one', () => {
    // y = 83 is in the row gap under text1 (ends 79) and above text2 (starts 87).
    expect(insertionAt({ x: 100, y: 83 }, spanTree())).toEqual({ parentPath: [0], index: 2 });
  });

  test('over the spanning cell itself the side still follows its centre', () => {
    // Guard: the avatar is hit directly, so the row maths is not consulted at all.
    expect(insertionAt({ x: 250, y: 120 }, spanTree())).toEqual({ parentPath: [0], index: 2 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=sheetDnd`
Expected: FAIL — the first two new tests get `index: 1` instead of `3` and `2`. The third passes. All pre-existing tests pass.

- [ ] **Step 3: Implement the clip in `rowsOf`**

In `warhammer-battle-helper-front/src/utils/sheetDnd.js`, replace the end of `rowsOf`:

```js
  // A row is as tall as its tallest cell — the whole reason this feature cannot displace items
  // during a drag.
  rows.forEach((r) => { r.bottom = Math.max(...r.items.map((it) => bottom(it.child.rect))); });
  return rows;
}
```

with:

```js
  // A row is as tall as its tallest cell — the whole reason this feature cannot displace items
  // during a drag.
  rows.forEach((r) => { r.bottom = Math.max(...r.items.map((it) => bottom(it.child.rect))); });
  // ...except a cell spanning several grid rows (PLAYRPG-241: an avatar beside two stacked text
  // fields). It starts in this row but ends at the bottom of a later one, so the max above would
  // make this row's band cover the rows below it, and a pointer beside a lower field would be
  // matched against this row's cells. Clip every row at the next row's top minus the gap. For an
  // ordinary row the grid already keeps its bottom above that line, so only spanning cells are
  // affected.
  const byTop = [...rows].sort((a, b) => a.top - b.top);
  byTop.forEach((r, i) => {
    const next = byTop[i + 1];
    if (next) r.bottom = Math.min(r.bottom, next.top - GAP);
  });
  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=sheetDnd`
Expected: PASS, all tests in `sheetDnd.test.js` (old and new).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/sheetDnd.js warhammer-battle-helper-front/src/utils/sheetDnd.test.js
git commit -m "fix: PLAYRPG-241 keep drop rows apart when a cell spans two grid rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 3: One grid cell per field, the same element in game and creator

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`withChrome` ~lines 110–127, `renderSection` ~lines 531–548, imports)
- Create: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.rowSpan.test.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.tiles.test.jsx:20`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx` (header comment, `CELL_ROOTS` comment, the "each grid holds exactly its fields" test) and `__snapshots__/CustomSheetBody.domShape.test.jsx.snap`

**Interfaces:**
- Consumes: `fieldRowSpan(field): 1 | 2 | null` from `./fieldRowSpan` (Task 1).
- Produces: DOM contract used by Task 4's CSS — every child of `.custom-sheet__fields` is one element with class `custom-sheet__cell`, plus `custom-sheet__cell--rows-1` or `custom-sheet__cell--rows-2` when the span is not null. In the creator the same element also carries `custom-sheet__editable`. Children of `.custom-sheet__sections` (root sections) carry no cell class.

Background: today the grid child is the field's own root (`custom-sheet__tile`, `custom-sheet__attr`, …) in the game, but the `.custom-sheet__editable` wrapper in the creator. `grid-row: span 2` only works on the real grid child, so both modes must share one cell element. `TemplateBuilder` finds a field's measurable element with `el.closest('.custom-sheet__editable')` and a nested section's grid with `wrapper.querySelector(':scope > .custom-sheet__section > .custom-sheet__fields')`; both keep working because the editable wrapper is still the direct parent of the field/section root.

- [ ] **Step 1: Write the failing render test**

`warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.rowSpan.test.jsx`:

```jsx
/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

// PLAYRPG-241: the grid child of a section is always one cell element carrying the field's row
// span, in the game and in the creator alike. If the creator wrapped the cell in a second
// element, the span would sit on the wrong grid child and the creator would lie about the layout.
const sections = [{
  id: 's', title: '', columns: 2, fields: [
    { key: 'name', type: 'char_name', label: 'Name' },
    { key: 'portrait', type: 'char_avatar', label: 'Portrait' },
    { key: 'career', type: 'text_short', label: 'Career' },
    { key: 'ws', type: 'attr', label: 'WS' },
    { key: 'bs', type: 'attr', label: 'BS', hasAdvances: true },
    { key: 'pic', type: 'image', label: 'Picture' },
  ],
}];

const gridOf = (container) => container.querySelector('.custom-sheet__fields--2-col');

test('in the game every field sits in one cell carrying its row span', () => {
  const { container } = render(<CustomSheetBody sections={sections} />);
  expect([...gridOf(container).children].map((cell) => cell.className)).toEqual([
    'custom-sheet__cell custom-sheet__cell--rows-1',
    'custom-sheet__cell custom-sheet__cell--rows-2',
    'custom-sheet__cell custom-sheet__cell--rows-1',
    'custom-sheet__cell custom-sheet__cell--rows-1',
    'custom-sheet__cell custom-sheet__cell--rows-2',
    'custom-sheet__cell',
  ]);
});

test('in the creator the chrome wrapper is the cell, not a wrapper around it', () => {
  const { container } = render(<CustomSheetBody sections={sections} renderChrome={() => null} />);
  const cells = [...gridOf(container).children];
  expect(cells).toHaveLength(sections[0].fields.length);
  cells.forEach((cell) => {
    expect(cell).toHaveClass('custom-sheet__cell');
    expect(cell).toHaveClass('custom-sheet__editable');
  });
  expect(cells[1]).toHaveClass('custom-sheet__cell--rows-2');
  expect(container.querySelector('.custom-sheet__cell .custom-sheet__cell')).toBeNull();
});

test('root sections are not grid cells', () => {
  const game = render(<CustomSheetBody sections={sections} />);
  expect(game.container.querySelector('.custom-sheet__sections > .custom-sheet__cell')).toBeNull();
  game.unmount();

  const creator = render(<CustomSheetBody sections={sections} renderChrome={() => null} />);
  const rootWrapper = creator.container.querySelector('.custom-sheet__sections > .custom-sheet__editable');
  expect(rootWrapper).not.toHaveClass('custom-sheet__cell');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.rowSpan`
Expected: FAIL — first test gets `custom-sheet__tile custom-sheet__tile--text` etc. instead of cell classes; second test fails on `custom-sheet__cell`. Third test passes.

- [ ] **Step 3: Implement the cell in `CustomSheetBody.jsx`**

Add the import after the `SheetImagePicker` import line:

```js
import { fieldRowSpan } from './fieldRowSpan';
```

Replace the whole `withChrome` definition (from `const withChrome = (node, path, buildElement) => {` to its closing `};`) with:

```jsx
  // `cellClass` is set for the children of a section's grid and left null for root sections.
  // A grid child must be the SAME element in the session and in the creator (PLAYRPG-241):
  // a field's row span is a `grid-row` on that child, and if the creator wrapped the cell in a
  // second element the span would land on the wrong box and the creator would lie about the
  // layout. So the session wraps the field in the cell, and the creator puts its editable
  // wrapper on that very element instead of adding one more.
  const withChrome = (node, path, buildElement, cellClass = null) => {
    if (!renderChrome) {
      if (!cellClass) return buildElement();
      const element = buildElement();
      if (!element) return element;
      return <div className={cellClass} key={nodeId(node)}>{element}</div>;
    }
    // Chrome is computed before the subtree so a node's own affordances are registered ahead of
    // its descendants': renderSection/renderField are plain synchronous calls, not deferred
    // React elements, so a pre-built child would always run its chrome first.
    const chrome = renderChrome(node, path);
    const element = buildElement();
    // A node that renders to nothing gets no wrapper and no chrome. The already-computed chrome
    // is dropped, which costs one wasted call on a node that cannot appear on screen anyway —
    // the alternative, building the element first to test it, would reintroduce the very
    // bottom-up ordering this helper exists to avoid.
    if (!element) return element;
    return (
      <div className={cellClass ? `custom-sheet__editable ${cellClass}` : 'custom-sheet__editable'} key={nodeId(node)}>
        {element}
        {chrome}
      </div>
    );
  };

  // cellClassOf names the grid cell a section child occupies; its modifier carries the row
  // span (fieldRowSpan), and a field whose height follows its content gets no modifier.
  const cellClassOf = (field) => {
    const span = fieldRowSpan(field);
    return span ? `custom-sheet__cell custom-sheet__cell--rows-${span}` : 'custom-sheet__cell';
  };
```

Note: keep the long comment block that currently sits directly above `const withChrome` unchanged.

In `renderSection`, replace:

```jsx
        {(section.fields || []).map((child, i) =>
          withChrome(child, [...path, i], () => renderField(child, [...path, i]))
        )}
```

with:

```jsx
        {(section.fields || []).map((child, i) =>
          withChrome(child, [...path, i], () => renderField(child, [...path, i]), cellClassOf(child))
        )}
```

Leave the root call `withChrome(section, [i], () => renderSection(section, false, [i]))` unchanged.

- [ ] **Step 4: Run the new test**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.rowSpan`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the existing CustomSheetBody tests and see which break**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Expected: FAIL in exactly these places, all caused by the deliberate new cell element:
- `CustomSheetBody.tiles.test.jsx` — "number, progress, computed and text share the tile skeleton" (selector `.custom-sheet__fields > .custom-sheet__tile` finds 0).
- `CustomSheetBody.domShape.test.jsx` — both snapshot tests and "each grid holds exactly its fields as direct children".
Any other failure is a real regression: stop and investigate before continuing.

- [ ] **Step 6: Update the tiles test selector**

In `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.tiles.test.jsx`, replace:

```js
  const tiles = container.querySelectorAll('.custom-sheet__fields > .custom-sheet__tile');
```

with:

```js
  const tiles = container.querySelectorAll('.custom-sheet__fields > .custom-sheet__cell > .custom-sheet__tile');
```

- [ ] **Step 7: Update the domShape test**

In `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx`:

a) Replace the header comment paragraph

```js
// These snapshots are taken BEFORE the seam is added. Never refresh them while adding the seam —
// a snapshot refreshed alongside the change it is meant to police proves nothing.
```

with:

```js
// These snapshots are taken BEFORE the seam is added. Never refresh them while adding the seam —
// a snapshot refreshed alongside the change it is meant to police proves nothing.
//
// PLAYRPG-241 deliberately changed the shape: every field of a section now sits in one
// `.custom-sheet__cell` element that carries its row span, and that cell is the grid child.
// The snapshots were refreshed in that commit and nowhere else.
```

b) Replace the comment above `CELL_ROOTS`

```js
// Exactly the classes a field renderer can put at the root of a grid cell, as whole class
// tokens.
```

with:

```js
// Exactly the classes a field renderer can put at the root inside a grid cell, as whole class
// tokens.
```

(keep the rest of that comment and the `CELL_ROOTS` array unchanged).

c) In the test `'each grid holds exactly its fields as direct children, and nothing else'`, replace:

```js
    // Class membership rather than a `.custom-sheet__field` selector: an `attr` field roots at
    // `custom-sheet__attr` and carries no `.custom-sheet__field` class at all, so a selector
    // built on that class is blind to the one type it matters most for.
    [...rootGrid.children, ...gearGrid.children].forEach((child) => {
      expect(CELL_ROOTS.some((cls) => child.classList.contains(cls))).toBe(true);
    });
```

with:

```js
    // Every grid child is a cell holding exactly one field root. Class membership rather than a
    // `.custom-sheet__field` selector: an `attr` field roots at `custom-sheet__attr` and carries
    // no `.custom-sheet__field` class at all, so a selector built on that class is blind to the
    // one type it matters most for.
    [...rootGrid.children, ...gearGrid.children].forEach((cell) => {
      expect(cell.classList.contains('custom-sheet__cell')).toBe(true);
      expect(cell.children).toHaveLength(1);
      expect(CELL_ROOTS.some((cls) => cell.children[0].classList.contains(cls))).toBe(true);
    });
```

d) Refresh only this file's snapshots:

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.domShape -u`
Expected: PASS, `2 snapshots updated`.

e) Review the snapshot diff:

Run: `git diff --stat warhammer-battle-helper-front/src/systems/custom/__snapshots__/` and `git diff warhammer-battle-helper-front/src/systems/custom/__snapshots__/ | grep -o 'custom-sheet__cell[a-z0-9 _-]*' | sort | uniq -c`
Expected: the only added markup is `<div class=\"custom-sheet__cell…\">` openings and their closing `</div>`; in the 3-col root section the classes are, in order, `--rows-1` (attr_ws), `--rows-2` (attr_bs), `--rows-1` (num_gold), `--rows-1` (lbl_note), `--rows-1` (txt_name), `--rows-2` (txt_bio), `--rows-1` (chk_dead), `--rows-1` (sel_race), `--rows-1` (prg_hp); in the 2-col gear section all three cells have no modifier. If anything else changed, stop and investigate.

- [ ] **Step 8: Run all CustomSheetBody and creator tests**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="CustomSheetBody|TemplateBuilder|creator"`
Expected: PASS, all suites.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
  warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.rowSpan.test.jsx \
  warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.tiles.test.jsx \
  warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx \
  warhammer-battle-helper-front/src/systems/custom/__snapshots__/CustomSheetBody.domShape.test.jsx.snap
git commit -m "feat: PLAYRPG-241 wrap each section field in one grid cell carrying its row span

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 4: CSS — row unit, spans, fitted field heights

**Files:**
- Modify: `warhammer-battle-helper-front/src/style.css`

**Interfaces:**
- Consumes: the DOM contract from Task 3 (`.custom-sheet__cell`, `--rows-1`, `--rows-2`; creator cell also `.custom-sheet__editable`).
- Produces: nothing for later tasks.

jsdom computes no layout, so this task has no automated test of heights; Task 5 verifies them in a browser. Numbers below are derived from the current CSS:
- text tile = padding 5 + 7, border 2, head 16, gap 3, value row 26 → **59px** = row unit.
- two-row cell = 2 × 59 + 8 (grid gap) = **126px**.
- avatar tile = 5 + 7 + 2 + 16 + 3 + image → image must be ≤ 126 − 33 = **93px**; use **92px** (was 96).

- [ ] **Step 1: Row unit and grid rows**

In `style.css`, directly after the `.custom-sheet__fields--6-col { … }` rule (~line 7839), insert:

```css
/* Field heights (PLAYRPG-241). A field occupies one or two rows of a fixed unit — the height of
   a text tile — so two short fields stack exactly beside one avatar. `minmax(unit, auto)` lets a
   row grow when a field turns out taller (a table, or an attribute whose parts wrap in a narrow
   column) instead of clipping it. `align-items: start` stops the old behaviour of stretching every
   cell to the tallest one in its row: a text tile beside a table stays one unit tall.
   The 8px in the two-row height is the grid gap above; sheetDnd.js GAP mirrors it. */
.custom-sheet__fields {
    --sheet-row-unit: 59px;
}

.custom-sheet__fields--2-col,
.custom-sheet__fields--3-col,
.custom-sheet__fields--4-col,
.custom-sheet__fields--5-col,
.custom-sheet__fields--6-col {
    grid-auto-rows: minmax(var(--sheet-row-unit), auto);
    align-items: start;
}

/* The cell is the grid child in the session and the creator alike (in the creator it is also
   .custom-sheet__editable). Its field fills it, so a min-height on the cell is a min-height on
   the field. Free-height cells (no modifier) simply take their field's own height. */
.custom-sheet__cell {
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.custom-sheet__cell > *:first-child {
    flex: 1 1 auto;
    min-width: 0;
}

.custom-sheet__cell.custom-sheet__cell--rows-1 {
    min-height: var(--sheet-row-unit);
}

.custom-sheet__cell.custom-sheet__cell--rows-2 {
    grid-row: span 2;
    min-height: calc(2 * var(--sheet-row-unit) + 8px);
}
```

Note: `.custom-sheet__editable` (declared later, ~line 7884) also sets `display: flex; flex-direction: column; min-width: 0` — identical values, so the order between the two does not matter.

- [ ] **Step 2: Avatar fits two rows**

In the `.custom-sheet__image--avatar` rule and the `.custom-sheet__image--avatar .custom-sheet__image-img, .custom-sheet__image--avatar .custom-sheet__image-empty` rule (~lines 8336–8348), change every `96px` to `92px`, and add above the first rule:

```css
/* 92px keeps the avatar tile (head + paddings = 33px) inside two row units plus the gap:
   2 * 59 + 8 = 126 >= 92 + 33. A bigger image would push both of its rows taller than the text
   fields stacked beside it. */
```

- [ ] **Step 3: Long text fills its two rows; select/checkbox/label centre in one**

Directly after the `.custom-sheet__tile--image .custom-sheet__tile-value { … }` rule (~line 8299), insert:

```css
/* A long text field is two rows tall; its textarea takes the whole height instead of leaving an
   empty band under a 3-line box. */
.custom-sheet__cell--rows-2 > .custom-sheet__tile--text > .custom-sheet__tile-value {
    flex: 1 1 auto;
    align-items: stretch;
}
```

Directly after the `.custom-sheet__field--label { justify-content: center; }` rule (~line 8081), insert:

```css
/* Select and checkbox are shorter than a value tile; in a one-row cell they sit in its middle so
   a row of mixed fields reads as one line. */
.custom-sheet__cell--rows-1 > .custom-sheet__field {
    justify-content: center;
}
```

- [ ] **Step 4: Compact solo attribute**

Directly after the `@container (min-width: 200px) { … }` block that closes the attribute medallion rules (~line 9600, the first `@container (min-width: 200px)` after `.custom-sheet__attr-total`), insert:

```css
/* An attribute without advances is a one-row field (PLAYRPG-241): the same height as a text
   tile. The medallion's padding, header and big number are tightened only here; an attribute
   with advances keeps the full medallion in its two rows. */
.custom-sheet__cell--rows-1 > .custom-sheet__attr {
    gap: 2px;
    padding: 4px 7px 5px;
}

.custom-sheet__cell--rows-1 > .custom-sheet__attr .custom-sheet__attr-header {
    padding-bottom: 2px;
}

.custom-sheet__cell--rows-1 > .custom-sheet__attr .custom-sheet__attr-input.custom-sheet__attr-input--solo {
    padding: 0 4px;
    font-size: 1.15rem;
    line-height: 1.15;
}
```

These are starting values; Task 5 measures the result and adjusts them until the solo attribute cell and a text tile cell report the same height.

- [ ] **Step 5: Run the frontend suite**

Run: `CI=true npm test -- --watchAll=false`
Expected: all suites PASS except the known baseline `App.test.js` (axios ESM). CSS cannot break jsdom tests; this guards Task 3's DOM change across the whole app.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/style.css
git commit -m "feat: PLAYRPG-241 lay sheet fields on a row unit so short fields stack beside tall ones

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 5: Browser verification and height tuning

**Files:**
- Modify (only if measurements require): `warhammer-battle-helper-front/src/style.css` — values from Task 4 Steps 1, 2, 4.

**Interfaces:**
- Consumes: everything above.

This task needs the running app (docker stack, frontend on :3000) and a GM account with a custom template. If the executor cannot drive a browser, hand this task to the user and record it as pending.

- [ ] **Step 1: Build a test template**

In the template creator, add a 2-column section with fields in this order: `char_name`, `char_avatar`, `text_short`, `attr` (no advances), `attr` (with advances), `text_long`, `select`, `checkbox`, `skill_table`. Add a 3-column section: `text_short`, `text_short`, `char_avatar`, `text_short`, `text_short`.

- [ ] **Step 2: Measure cell heights**

In DevTools console on the creator page, then again on an in-game sheet using this template:

```js
[...document.querySelectorAll('.custom-sheet__cell')].map(c => [c.className.replace(/custom-sheet__/g, ''), Math.round(c.getBoundingClientRect().height)])
```

Expected:
- every `cell cell--rows-1` → 59,
- every `cell cell--rows-2` → 126,
- free cells (`cell` alone) → their content height,
- creator and game report the same numbers.

If `--rows-1` attr cells report more than 59: reduce the Task 4 Step 4 values (font-size first, then paddings) until they report 59. If `--rows-2` avatar cells report more than 126: reduce the avatar size from Task 4 Step 2. If text tiles report other than 59: set `--sheet-row-unit` to the measured text tile height and recompute the avatar size as `2 * unit + 8 - 33`.

- [ ] **Step 3: Visual check**

Confirm by eye:
- 2-col: `char_name` above `text_short`, both beside the avatar, with no gap below the second field.
- 3-col: avatar in column 3 spanning two rows, four text fields filling columns 1–2 of both rows.
- `attr` without advances is the same height as a text tile; `attr` with advances matches the avatar.
- `text_long` textarea fills its two rows.
- `select` and `checkbox` are vertically centred in one row.
- a text field next to the `skill_table` stays one unit tall (not stretched).

- [ ] **Step 4: Drag-and-drop check**

In the creator, drag a `text_short` and drop it (a) in the gap right of the lower text field beside the avatar and (b) between the two stacked text fields. The ghost and the final position must match where the pointer was: (a) after the lower field, (b) between the two.

- [ ] **Step 5: Commit any tuning**

Only if Step 2 changed CSS values:

```bash
git add warhammer-battle-helper-front/src/style.css
git commit -m "fix: PLAYRPG-241 tune sheet field heights to the measured row unit

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```
