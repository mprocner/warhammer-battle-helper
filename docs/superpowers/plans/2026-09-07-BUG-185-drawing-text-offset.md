# BUG-185 — Drawing Text Placement Offset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A text label committed by the drawing tool renders exactly where the input box stood while it was being typed.

**Architecture:** The bug is one point interpreted in two conventions — CSS `top/left` (box top-left, shifted further by border and padding) versus canvas `fillText` with the default `alphabetic` baseline (glyphs drawn entirely above the point). We settle on top-left everywhere: the canvas gets `ctx.textBaseline = 'top'`, the input loses its own box (`padding: 0`, `border: none`, `lineHeight: 1`, frame via `outline`, which takes no layout space). The text-box geometry that three call sites duplicate moves into one pure module, and the input moves out of the 1000-line `SceneViewport.jsx` into its own component that owns the alignment contract.

**Tech Stack:** React 18, Jest + React Testing Library via CRA (`react-scripts test`), plain Canvas 2D API. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/BUG-185.md`. Read it before starting.
- Frontend root for all commands: `warhammer-battle-helper-front/`.
- Test command: `CI=true npm test -- --watchAll=false` (single file: `--testPathPattern=<name>`). Bare `npx jest` does **not** work — CRA owns the config.
- Known baseline failure: `App.test.js` (axios ESM). It is **not** a regression — ignore it, never "fix" it.
- No i18n keys are added or changed by this plan. The text input renders no copy of its own.
- No backward compatibility for saved data: existing text paths will shift down by roughly one ascent. This is accepted; do not write a migration.
- Delete code that a change makes unused in the same commit — do not leave it behind with a comment.
- Test language follows the file being touched: `DrawingLayer.test.js` is written in Polish, so its new cases are Polish; new files follow `useDrawingTextInput.test.jsx` and are English.

---

### Task 1: Text-box geometry module

The single place where the top-left convention is written down, and the only copy of the
`0.6` / `1.2` ratios. Pure function — no DOM, no canvas, so it tests directly.

**Files:**
- Create: `warhammer-battle-helper-front/src/components/scene/drawingTextGeometry.js`
- Test: `warhammer-battle-helper-front/src/components/scene/drawingTextGeometry.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TEXT_BASELINE: string` (`'top'`) — the canvas `ctx.textBaseline` the box geometry assumes.
  - `CHAR_WIDTH_RATIO: number` (`0.6`) — glyph width as a fraction of font size.
  - `LINE_HEIGHT_RATIO: number` (`1.2`) — line height as a fraction of font size.
  - `textPathBox(path: { points: [[number, number]], text: string, fontSize?: number }) => { x: number, y: number, width: number, height: number }` — `x`/`y` are `points[0]`, i.e. the top-left corner.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/scene/drawingTextGeometry.test.js`:

```js
import { textPathBox, CHAR_WIDTH_RATIO, LINE_HEIGHT_RATIO } from './drawingTextGeometry';

describe('textPathBox', () => {
  const path = (text, fontSize) => ({
    tool: 'text',
    points: [[10, 20]],
    text,
    ...(fontSize ? { fontSize } : {}),
  });

  it('anchors the box at points[0] — the top-left corner of the first glyph', () => {
    expect(textPathBox(path('abc', 16))).toMatchObject({ x: 10, y: 20 });
  });

  it('scales width with the text length and the font size', () => {
    expect(textPathBox(path('abc', 20)).width).toBe(3 * 20 * CHAR_WIDTH_RATIO);
  });

  it('derives height from the font size alone', () => {
    expect(textPathBox(path('abc', 20)).height).toBe(20 * LINE_HEIGHT_RATIO);
  });

  it('falls back to 16px when the path carries no font size', () => {
    expect(textPathBox(path('abc'))).toMatchObject({
      width: 3 * 16 * CHAR_WIDTH_RATIO,
      height: 16 * LINE_HEIGHT_RATIO,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `warhammer-battle-helper-front/`:

```bash
CI=true npm test -- --watchAll=false --testPathPattern=drawingTextGeometry
```

Expected: FAIL — `Cannot find module './drawingTextGeometry' from 'src/components/scene/drawingTextGeometry.test.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `warhammer-battle-helper-front/src/components/scene/drawingTextGeometry.js`:

```js
/**
 * Geometry of a `text` drawing path.
 *
 * CONVENTION: `points[0]` is the top-left corner of the em box of the first glyph — never
 * the baseline. Three places depend on agreeing about it: DrawingLayer draws with
 * ctx.textBaseline = 'top', its hit-test and selection frame read the box below, and
 * DrawingTextInput places a padding-less input at the very same point. BUG-185 was exactly
 * this convention disagreeing with itself, so it lives here in one copy.
 *
 * TEXT_BASELINE and textPathBox must agree, and no type can force that — so they sit three
 * lines apart. Whoever changes the baseline sees the box on the same screen: for 'middle' the
 * box would have to return `y - height / 2` as its top edge.
 *
 * The ratios are approximations of a proportional font's metrics. They are good enough for a
 * hit box and a selection frame, and they deliberately avoid measuring the DOM.
 */
export const TEXT_BASELINE = 'top';
export const CHAR_WIDTH_RATIO = 0.6;
export const LINE_HEIGHT_RATIO = 1.2;

export function textPathBox(path) {
  const [x, y] = path.points[0];
  const fontSize = path.fontSize || 16;
  return {
    x,
    y,
    width: path.text.length * fontSize * CHAR_WIDTH_RATIO,
    height: fontSize * LINE_HEIGHT_RATIO,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=drawingTextGeometry
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/drawingTextGeometry.js \
        warhammer-battle-helper-front/src/components/scene/drawingTextGeometry.test.js
git commit -m "refactor(front): BUG-185 extract text path geometry into one module"
```

---

### Task 2: Canvas adopts the top-left convention

Render, hit-test and selection frame all switch to the new convention in one task — they must
agree with each other, so a reviewer cannot sensibly accept one and reject another.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/DrawingLayer.jsx:1` (import), `:73-79` (hit-test), `:201-206` (render), `:265-276` (selection frame)
- Test: `warhammer-battle-helper-front/src/components/scene/DrawingLayer.test.js`

**Interfaces:**
- Consumes: `textPathBox` and `TEXT_BASELINE` from `./drawingTextGeometry` (Task 1).
- Produces: no new exports. `findDeletablePathAt(paths, px, py, canDelete)` keeps its signature; only its answer for `tool: 'text'` changes.

- [ ] **Step 1: Write the failing test**

Append to `warhammer-battle-helper-front/src/components/scene/DrawingLayer.test.js`, after the
existing `describe('findDeletablePathAt', …)` block. `mine` and `asGM` already exist at the top of
the file — reuse them, do not redeclare.

```js
// Napis 'abcd' przy fontSize 20: pudełko od (100,100) o szerokości 4*20*0.6 = 48
// i wysokości 20*1.2 = 24, czyli x 100..148, y 100..124.
const textPath = (id, userId, x, y) => ({
  id,
  userId,
  tool: 'text',
  points: [[x, y]],
  text: 'abcd',
  fontSize: 20,
});

describe('findDeletablePathAt — tekst', () => {
  // points[0] to lewy-górny róg napisu, więc litery są POD tym punktem. Dawniej kanwa
  // rysowała od baseline'u i hit-box leżał nad nim — BUG-185.
  it('trafia w środek liter, poniżej points[0]', () => {
    const paths = [textPath('t', 'me', 100, 100)];
    expect(findDeletablePathAt(paths, 110, 110, mine)).toBe('t');
  });

  it('nie trafia nad points[0]', () => {
    const paths = [textPath('t', 'me', 100, 100)];
    expect(findDeletablePathAt(paths, 110, 90, mine)).toBeNull();
  });

  it('nie trafia za prawą krawędzią napisu', () => {
    const paths = [textPath('t', 'me', 100, 100)];
    expect(findDeletablePathAt(paths, 200, 110, mine)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=DrawingLayer
```

Expected: FAIL on the first two new cases — the old baseline hit-box spans `y` 76..104, so
`(110, 110)` returns `null` where `'t'` is expected, and `(110, 90)` returns `'t'` where `null` is
expected. The third case passes already; it is a guard against widening the box by accident.

- [ ] **Step 3: Write the minimal implementation**

**3a.** In `DrawingLayer.jsx`, add the import under the React import on line 1:

```js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { textPathBox, TEXT_BASELINE } from './drawingTextGeometry';
```

**3b.** Replace the `case 'text'` block inside `hitTestPath` (`:73-79`):

```js
    case 'text': {
      if (path.points.length === 0 || !path.text) return false;
      const { x, y, width, height } = textPathBox(path);
      return px >= x && px <= x + width && py >= y && py <= y + height;
    }
```

**3c.** Replace the `case 'text'` block inside `drawPath` (`:201-206`). The added
`ctx.textBaseline` needs no manual reset — the surrounding `ctx.save()` / `ctx.restore()` already
covers it:

```js
      case 'text': {
        if (path.points.length === 0 || !path.text) break;
        const [tx, ty] = path.points[0];
        ctx.font = `${path.fontSize || 16}px sans-serif`;
        // points[0] is the top-left corner of the glyph box, not the baseline — see
        // drawingTextGeometry, which owns both this mode and the matching box geometry.
        // The typing input stands on the same point.
        ctx.textBaseline = TEXT_BASELINE;
        ctx.fillText(path.text, tx, ty);
        break;
      }
```

**3d.** Replace the `case 'text'` block inside `drawHighlight` (`:265-276`). Note the `ctx.font`
line goes away with it: this branch only strokes a rectangle, so the font was never used.

```js
      case 'text': {
        if (path.points.length === 0 || !path.text) break;
        const { x, y, width, height } = textPathBox(path);
        ctx.lineWidth = 1;
        ctx.setLineDash(dashed ? [8, 4] : []);
        ctx.strokeStyle = '#00e5ff';
        ctx.strokeRect(x - 3, y - 3, width + 6, height + 6);
        break;
      }
```

**3e.** Update the tool-encoding comment in the file header (`:17`) so the convention is visible
where a reader meets the shape:

```js
 *  - text: [[x,y]] — x,y = top-left corner of the glyph box (see drawingTextGeometry)
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=DrawingLayer
```

Expected: PASS — the 6 pre-existing `findDeletablePathAt` cases plus the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/DrawingLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/DrawingLayer.test.js
git commit -m "fix(front): BUG-185 draw text paths from their top-left corner"
```

---

### Task 3: Text input as its own component

The input moves out of `SceneViewport.jsx` and takes the alignment contract with it, so the next
person who reaches for `padding` for breathing room reads why they cannot have it.

**Files:**
- Create: `warhammer-battle-helper-front/src/components/scene/DrawingTextInput.jsx`
- Test: `warhammer-battle-helper-front/src/components/scene/DrawingTextInput.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx:13` (import), `:946-971` (replace the inline `<input>`)

**Interfaces:**
- Consumes: the values `useDrawingTextInput` already returns — `pos`, `value`, `setValue`, `commit`, `cancel`.
- Produces: default export `DrawingTextInput({ pos, value, onChange, onCommit, onCancel, color, fontSize })`. `pos` is `[x, y]` in scene coordinates; **`onChange` receives the new string, not the event** — that is what lets `SceneViewport` pass `textInput.setValue` straight through.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/scene/DrawingTextInput.test.jsx`. No i18n
import is needed — this component renders no copy.

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DrawingTextInput from './DrawingTextInput';

describe('DrawingTextInput', () => {
  const setup = (overrides = {}) => {
    const props = {
      pos: [40, 60],
      value: 'hi',
      onChange: jest.fn(),
      onCommit: jest.fn(),
      onCancel: jest.fn(),
      color: '#ff0000',
      fontSize: 16,
      ...overrides,
    };
    render(<DrawingTextInput {...props} />);
    return { props, input: screen.getByRole('textbox') };
  };

  it('commits on Enter', () => {
    const { props, input } = setup();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onCommit).toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('discards on Escape', () => {
    const { props, input } = setup();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalled();
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it('commits on blur', () => {
    const { props, input } = setup();
    fireEvent.blur(input);
    expect(props.onCommit).toHaveBeenCalled();
  });

  it('reports the typed string, not the event', () => {
    const { props, input } = setup();
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(props.onChange).toHaveBeenCalledWith('abc');
  });

  // BUG-185: the canvas draws the committed label from pos with textBaseline 'top', so the
  // input's box must not push its own text away from pos. border and padding would; outline
  // does not, because it takes no space in layout.
  it('stands on pos with a box that cannot shift its own text', () => {
    const { input } = setup();
    expect(input.style.left).toBe('40px');
    expect(input.style.top).toBe('60px');
    expect(input.style.padding).toBe('0px');
    expect(input.style.border).toBe('none');
    expect(input.style.lineHeight).toBe('1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=DrawingTextInput
```

Expected: FAIL — `Cannot find module './DrawingTextInput' from 'src/components/scene/DrawingTextInput.test.jsx'`.

- [ ] **Step 3: Write the minimal implementation**

Create `warhammer-battle-helper-front/src/components/scene/DrawingTextInput.jsx`:

```jsx
import React from 'react';

/**
 * The in-progress label of the drawing `text` tool: where the user types before the text
 * becomes a path on the canvas. Who owns what: useDrawingTextInput decides *when* a label is
 * saved or dropped, SceneViewport supplies colour and size, this component is only its looks.
 *
 * ALIGNMENT CONTRACT (BUG-185): `pos` is the top-left corner of the glyph box — the very point
 * DrawingLayer later draws from with ctx.textBaseline = 'top' (see drawingTextGeometry). The
 * input must therefore not move its own content away from that corner:
 *   - no `padding` and no `border` — both would inset the text inside the box,
 *   - `lineHeight: 1` — the default `normal` is ~1.2em and its half-leading would push the
 *     text down,
 *   - the visible frame is an `outline`, which unlike a border takes no space in layout.
 * Add padding here and the committed text will jump away from where it was typed again.
 */
const DrawingTextInput = ({ pos, value, onChange, onCommit, onCancel, color, fontSize }) => (
  <input
    autoFocus
    type="text"
    value={value}
    onChange={e => onChange(e.target.value)}
    onKeyDown={e => {
      if (e.key === 'Enter') onCommit();
      if (e.key === 'Escape') onCancel();
    }}
    onBlur={onCommit}
    style={{
      position: 'absolute',
      left: pos[0],
      top: pos[1],
      zIndex: 30,
      background: 'rgba(0,0,0,0.7)',
      color,
      fontSize,
      fontFamily: 'sans-serif',
      lineHeight: 1,
      padding: 0,
      border: 'none',
      outline: `1px solid ${color}`,
      minWidth: 80,
    }}
  />
);

export default DrawingTextInput;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=DrawingTextInput
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into SceneViewport**

**5a.** Add the import next to the existing `useDrawingTextInput` import (`SceneViewport.jsx:13`):

```js
import { useDrawingTextInput } from './useDrawingTextInput';
import DrawingTextInput from './DrawingTextInput';
```

**5b.** Replace the whole inline `<input>` block (`:946-971`) with:

```jsx
                {textInput.pos && (
                  <DrawingTextInput
                    pos={textInput.pos}
                    value={textInput.value}
                    onChange={textInput.setValue}
                    onCommit={textInput.commit}
                    onCancel={textInput.cancel}
                    color={drawingColor}
                    fontSize={drawingFontSize}
                  />
                )}
```

- [ ] **Step 6: Run the whole frontend suite**

```bash
CI=true npm test -- --watchAll=false
```

Expected: every suite passes except `App.test.js`, which fails on the axios ESM import. That
failure is the known baseline — confirm nothing else is red.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/DrawingTextInput.jsx \
        warhammer-battle-helper-front/src/components/scene/DrawingTextInput.test.jsx \
        warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx
git commit -m "refactor(front): BUG-185 extract DrawingTextInput with its alignment contract"
```

---

### Task 4: Manual verification in the browser

jsdom does not rasterise, so no automated test can see the actual pixels. The fix has to be looked
at.

**Files:** none — verification only.

**Interfaces:**
- Consumes: Tasks 1-3, all committed.
- Produces: nothing. A written result to report.

- [ ] **Step 1: Bring the stack up and open a scene**

Run the docker stack and open the app at `http://localhost:3000`. Log in as GM, enter a game with a
scene, switch the editing layer to **drawing**, pick the **text** tool.

- [ ] **Step 2: Check the reported symptom**

Click on the map, type `TEST`, press Enter.

Expected: the label sits exactly where the input box stood — same top-left corner, no jump up and
no jump left. This is the BUG-185 acceptance criterion.

- [ ] **Step 3: Check the other three paths through the same code**

1. Click, type `A`, then click **elsewhere on the map** — `useDrawingTextInput.placeAt` commits the
   first label. It must land where its input stood, and the second click must not open a field.
2. Click, type `B`, press **Escape** — nothing is saved.
3. Click, type `C`, Enter, then **right-click on the label** — it is deleted. This exercises the
   new hit box; the old one sat above the glyphs, so a click on the letters used to miss.
4. With the **select** tool, click the label — the cyan dashed frame must surround the letters, not
   float above them.

- [ ] **Step 4: Report**

State what was checked and what was seen. If any step misbehaves, stop and report rather than
patching around it — a mismatch here means the convention still disagrees somewhere.

---

## Out of scope

Do not do these, even if tempting while in the files:

- Any migration or fix-up of text paths already saved in scenes. They shift down by roughly one
  ascent, and that is accepted.
- Improving `CHAR_WIDTH_RATIO` accuracy via `ctx.measureText`. The hit box stays an approximation.
- Moving the other `hitTestPath` branches (freehand, line, rect, circle, arrow) into a module.
  They have no problem; that is a separate refactor.
- Any change to `useDrawingTextInput` behaviour. Its commit/cancel rules (FEATURE-121) stay as they
  are; only the JSX around it moves.
