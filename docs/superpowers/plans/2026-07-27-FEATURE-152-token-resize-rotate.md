# FEATURE-152 — Token resize + rotate: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single selected token — character or image — can be resized and rotated regardless of whether the Pan or Select tool is active.

**Architecture:** One pure predicate (`canManipulateToken`) replaces the two divergent inline conditions that gate the handles today, and gates both handle kinds in both host components. Rotation math is extracted from `SceneImage` into a shared `useTokenRotate` hook — it operates on screen pixels from the DOM and degrees, so unlike resize it is unit-agnostic and shares cleanly. Character tokens gain a new persisted `rotation` field; scene images already have one.

**Tech Stack:** React 19 (CRA + jest/@testing-library), Go + Gin + MongoDB, i18next.

**Spec:** `docs/superpowers/specs/2026-07-27-FEATURE-152-token-resize-rotate-design.md`

## Global Constraints

- **i18n:** never put a literal string in JSX. Use `t('key')` with an **English key**, and add the entry to **both** `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- **Icons:** only `@mui/icons-material`. No inline SVG, no other icon library.
- **Tooltips:** never MUI `<Tooltip>`. Existing handles use the native `title` attribute — keep that.
- **No backward compatibility shims.** Old documents without the new field read as `0`; no migration, no fallback branches beyond `|| 0`.
- **Delete dead code in the same commit** — no flag-and-leave.
- **Frontend test command:** `CI=true npx react-scripts test --testPathPattern <pattern>` run from `warhammer-battle-helper-front/`.
- **Backend build command:** `go build ./...` run from `warhammer-battle-helper-backend/`.
- All paths below are relative to the repository root `/Users/mateuszprocner/priv/warhammer-battle-helper`.

## File Structure

| File | Responsibility |
|---|---|
| `warhammer-battle-helper-front/src/utils/tokenManipulation.js` | **New.** Pure predicate deciding whether a token shows manipulation handles. No React. |
| `warhammer-battle-helper-front/src/utils/tokenManipulation.test.js` | **New.** Truth table for the predicate. |
| `warhammer-battle-helper-front/src/components/scene/useTokenRotate.js` | **New.** Shared rotation drag hook (pointer angle → degrees → commit). |
| `warhammer-battle-helper-front/src/components/scene/TokenRotateHandle.jsx` | **New.** Presentational rotate handle, mirrors `TokenResizeHandles.jsx`. |
| `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx` | Uses the predicate + hook; wraps its overlay in a counter-rotating node. |
| `warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx` | Uses the predicate + hook; rotates its avatar badge. |
| `warhammer-battle-helper-front/src/components/scene/MapTokensLayer.jsx` | Passes `rotation` and `onCommitRotate` down to character tokens. |
| `warhammer-battle-helper-front/src/components/DndContext.jsx` | Owns `handleRotateCharacter`, extends the optimistic override and the group rotation reset. |
| `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx` | Threads `onCommitRotate` through to the tokens layer. |
| `warhammer-battle-helper-front/src/utils/tokenGeometry.js` | `characterToMapToken` stops hardcoding `rotation: 0`. |
| `warhammer-battle-helper-front/src/style.css` | `.token-rotate-handle`, `.scene-image__upright`. |
| `warhammer-battle-helper-backend/internal/models/Game.go` | `Rotation` on `GameCharacter` and on `UpdateSceneCharacterRequest`. |
| `warhammer-battle-helper-backend/internal/repository/GameRepository.go` | Persists `rotation` in the partial `$set`. |

**Task order rationale:** Tasks 1–2 build tested, dependency-free units. Task 3 is the backend, independently verifiable. Tasks 4–5 wire each host. Task 6 finishes the group-reset and adapter consistency. Each task ends green and committed.

---

### Task 1: The `canManipulateToken` predicate

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/tokenManipulation.js`
- Test: `warhammer-battle-helper-front/src/utils/tokenManipulation.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `canManipulateToken({ allowed, locked, editingLayer, activeTool, imageEditLayer, activeSelected, groupSelected, multiSelectActive }) → boolean`. All arguments are optional and default to falsy except where noted. Tasks 4 and 5 call it.

**Background the implementer needs:** The app has two *independent* selection states and they must not be conflated. `activeSelected` is the single clicked/active token (`activeTokenId === character.id`, or `selectedImageId === image.id`). `groupSelected` is membership in the marquee selection (`isTokenSelected(kind, id)`). Handles follow `activeSelected` under the Pan tool and `groupSelected` under the Select tool.

`editingLayer` is the active tool tab: `null` = Pan, `'select'`, `'measure'`, `'fog'`, `'drawing'`. `activeTool` is the tool *within* a tab; `'pan'` means the user temporarily switched to panning without leaving fog/drawing mode. `imageEditLayer` is the armed layer in Select mode: `'background' | 'gm' | 'tokens'`.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/utils/tokenManipulation.test.js`:

```js
import { canManipulateToken } from './tokenManipulation';

// Base: an unlocked token the user may edit, with nothing selected and no tool active.
const base = {
  allowed: true,
  locked: false,
  editingLayer: null,
  activeTool: null,
  imageEditLayer: 'background',
  activeSelected: false,
  groupSelected: false,
  multiSelectActive: false,
};

describe('canManipulateToken', () => {
  describe('pan context (editingLayer null)', () => {
    it('shows handles for the active token', () => {
      expect(canManipulateToken({ ...base, activeSelected: true })).toBe(true);
    });

    it('hides handles when no token is active', () => {
      expect(canManipulateToken({ ...base })).toBe(false);
    });

    it('ignores the group selection in pan context', () => {
      expect(canManipulateToken({ ...base, groupSelected: true })).toBe(false);
    });
  });

  describe("pan tool inside another tab (activeTool 'pan')", () => {
    it('behaves like the pan tab', () => {
      expect(canManipulateToken({
        ...base, editingLayer: 'drawing', activeTool: 'pan', activeSelected: true,
      })).toBe(true);
    });

    it('hides handles for a non-pan tool in that tab', () => {
      expect(canManipulateToken({
        ...base, editingLayer: 'drawing', activeTool: 'freehand', activeSelected: true,
      })).toBe(false);
    });
  });

  describe('select context', () => {
    const select = { ...base, editingLayer: 'select', imageEditLayer: 'tokens' };

    it('shows handles for a single group-selected token', () => {
      expect(canManipulateToken({ ...select, groupSelected: true })).toBe(true);
    });

    it('hides handles when more than one token is selected', () => {
      expect(canManipulateToken({
        ...select, groupSelected: true, multiSelectActive: true,
      })).toBe(false);
    });

    it('hides handles for a token outside the selection', () => {
      expect(canManipulateToken({ ...select })).toBe(false);
    });

    it('hides handles when another layer is armed', () => {
      expect(canManipulateToken({
        ...select, imageEditLayer: 'background', groupSelected: true,
      })).toBe(false);
    });

    it('ignores the active token in select context', () => {
      expect(canManipulateToken({ ...select, activeSelected: true })).toBe(false);
    });
  });

  describe('gates that override every context', () => {
    it('hides handles without permission', () => {
      expect(canManipulateToken({ ...base, allowed: false, activeSelected: true })).toBe(false);
    });

    it('hides handles on a locked token', () => {
      expect(canManipulateToken({ ...base, locked: true, activeSelected: true })).toBe(false);
    });
  });

  describe('tool tabs that own the pointer', () => {
    it.each(['measure', 'fog', 'drawing'])('hides handles in %s mode', (layer) => {
      expect(canManipulateToken({
        ...base, editingLayer: layer, activeSelected: true, groupSelected: true,
      })).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern tokenManipulation
```

Expected: FAIL — `Cannot find module './tokenManipulation'`.

- [ ] **Step 3: Write the implementation**

Create `warhammer-battle-helper-front/src/utils/tokenManipulation.js`:

```js
// Decides whether a map token shows its manipulation chrome (resize handles + rotate handle).
// Shared by BOTH token kinds so the two hosts can never drift apart — this rule previously lived
// as two hand-synced inline conditions, which is exactly how Select mode ended up without handles.
//
// Two independent selection states feed in and must not be confused:
//   activeSelected — the single clicked/active token (activeTokenId / selectedImageId)
//   groupSelected  — membership in the marquee selection (isTokenSelected)
// Pan follows the active token; Select follows a one-element group selection.
export function canManipulateToken({
  allowed = false,
  locked = false,
  editingLayer = null,
  activeTool = null,
  imageEditLayer = 'background',
  activeSelected = false,
  groupSelected = false,
  multiSelectActive = false,
} = {}) {
  if (!allowed || locked) return false;

  // Pan tab, or the pan tool borrowed inside fog/drawing.
  if (editingLayer === null || activeTool === 'pan') return activeSelected;

  // Select tab: only on the armed tokens layer, and only for a lone selection — rotating a group
  // would move each token's centre, which is a different operation (see the spec).
  if (editingLayer === 'select') {
    return imageEditLayer === 'tokens' && groupSelected && !multiSelectActive;
  }

  // measure / fog / drawing own the pointer.
  return false;
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern tokenManipulation
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/tokenManipulation.js warhammer-battle-helper-front/src/utils/tokenManipulation.test.js
git commit -m "feat(scene): canManipulateToken predicate (FEATURE-152)"
```

---

### Task 2: The `useTokenRotate` hook and the rotate handle

**Files:**
- Create: `warhammer-battle-helper-front/src/components/scene/useTokenRotate.js`
- Create: `warhammer-battle-helper-front/src/components/scene/TokenRotateHandle.jsx`
- Modify: `warhammer-battle-helper-front/src/style.css` (add `.token-rotate-handle`)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `warhammer-battle-helper-front/src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `snapAngle` from `src/utils/angleSnap.js` — signature `snapAngle(angle, step = 45, threshold = 10) → number`.
- Produces:
  - `useTokenRotate({ containerRef, rotation, setRotation, enabled, onCommit }) → { isRotating, handleRotateStart }`, where `containerRef` is a ref to the element whose centre is the pivot, `rotation` is the current angle in degrees, `setRotation(deg)` updates it live, `enabled` is a boolean guard, and `onCommit(deg)` persists the final angle. `handleRotateStart(event)` is a `mousedown` handler.
  - `<TokenRotateHandle onRotateStart={fn} />` — renders `<div className="token-rotate-handle">`.
  - i18n key `scenes.rotateToken`.

**Background:** This is a move of the logic at `SceneImage.jsx:254-292`, not a rewrite. Task 4 deletes the original. The angle is measured from the container's centre in *screen* pixels via `getBoundingClientRect()`, which is why this works identically for both token kinds despite their different model units. `snapAngle` is magnetic, not discrete: it pulls to a multiple of 45° only within 10°, otherwise it returns the raw angle.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/scene/useTokenRotate.test.jsx`:

```jsx
import React, { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useTokenRotate } from './useTokenRotate';

// Harness: a 100x100 box whose centre sits at (150, 150) in screen coordinates.
function Harness({ enabled = true, onCommit = () => {}, initial = 0 }) {
  const containerRef = useRef(null);
  const [rotation, setRotation] = useState(initial);
  const { isRotating, handleRotateStart } = useTokenRotate({
    containerRef, rotation, setRotation, enabled, onCommit,
  });
  return (
    <div ref={containerRef} data-testid="box">
      <span data-testid="angle">{rotation}</span>
      <span data-testid="state">{isRotating ? 'rotating' : 'idle'}</span>
      <button data-testid="handle" onMouseDown={handleRotateStart}>rotate</button>
    </div>
  );
}

// jsdom has no layout, so getBoundingClientRect always returns zeros — stub it.
function stubBox() {
  screen.getByTestId('box').getBoundingClientRect = () => ({
    left: 100, top: 100, width: 100, height: 100, right: 200, bottom: 200, x: 100, y: 100,
  });
}

describe('useTokenRotate', () => {
  it('starts idle', () => {
    render(<Harness />);
    expect(screen.getByTestId('state')).toHaveTextContent('idle');
  });

  it('enters the rotating state on mousedown', () => {
    render(<Harness />);
    stubBox();
    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 150, clientY: 100 });
    expect(screen.getByTestId('state')).toHaveTextContent('rotating');
  });

  it('does nothing when disabled', () => {
    render(<Harness enabled={false} />);
    stubBox();
    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 150, clientY: 100 });
    expect(screen.getByTestId('state')).toHaveTextContent('idle');
  });

  it('follows the pointer around the centre', () => {
    render(<Harness />);
    stubBox();
    // Grab at 12 o'clock (dx 0, dy -50), drag to 3 o'clock (dx +50, dy 0): a quarter turn.
    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 150, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 150 });
    expect(screen.getByTestId('angle')).toHaveTextContent('90');
  });

  it('commits the final angle once on mouseup', () => {
    const onCommit = jest.fn();
    render(<Harness onCommit={onCommit} />);
    stubBox();
    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 150, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 150 });
    fireEvent.mouseUp(document, { clientX: 200, clientY: 150 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(90);
    expect(screen.getByTestId('state')).toHaveTextContent('idle');
  });

  it('magnetically snaps a near-45 drag', () => {
    const onCommit = jest.fn();
    render(<Harness onCommit={onCommit} />);
    stubBox();
    // Grab at 12 o'clock, release just past 3 o'clock — within snapAngle's 10 deg threshold of 90.
    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 150, clientY: 100 });
    fireEvent.mouseUp(document, { clientX: 200, clientY: 155 });
    expect(onCommit).toHaveBeenCalledWith(90);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern useTokenRotate
```

Expected: FAIL — `Cannot find module './useTokenRotate'`.

- [ ] **Step 3: Write the hook**

Create `warhammer-battle-helper-front/src/components/scene/useTokenRotate.js`:

```js
import { useState, useRef, useEffect, useCallback } from 'react';
import { snapAngle } from '../../utils/angleSnap';

// Shared rotation drag for BOTH token kinds. Unlike resize, this math is unit-agnostic: the pivot
// is read from the DOM in screen pixels via getBoundingClientRect and the result is degrees, so it
// never touches character cells or image pixels. That is why rotation shares a hook and resize
// does not.
//
// The caller owns the angle (rotation/setRotation) so it can reconcile with server state; the hook
// only drives it during a drag and reports the final value once, on mouseup.
export function useTokenRotate({ containerRef, rotation, setRotation, enabled = true, onCommit }) {
  const [isRotating, setIsRotating] = useState(false);
  const startRef = useRef(null);

  const angleFrom = (centerX, centerY, e) =>
    Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

  const handleRotateStart = useCallback((e) => {
    if (!enabled || e.button !== 0 || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation(); // never let the host start a drag, or the viewport start a marquee
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    startRef.current = {
      centerX,
      centerY,
      startAngle: angleFrom(centerX, centerY, e),
      startRotation: rotation,
    };
    setIsRotating(true);
  }, [enabled, containerRef, rotation]);

  useEffect(() => {
    if (!isRotating) return;

    const compute = (e) => {
      const { centerX, centerY, startAngle, startRotation } = startRef.current;
      return snapAngle(startRotation + (angleFrom(centerX, centerY, e) - startAngle));
    };

    const onMove = (e) => setRotation(compute(e));
    const onUp = (e) => {
      const final = compute(e);
      setRotation(final);
      setIsRotating(false);
      startRef.current = null;
      onCommit?.(final);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isRotating, setRotation, onCommit]);

  return { isRotating, handleRotateStart };
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern useTokenRotate
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the handle component**

Create `warhammer-battle-helper-front/src/components/scene/TokenRotateHandle.jsx`:

```jsx
import React from 'react';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import { useTranslation } from 'react-i18next';

// Shared rotate chrome used by BOTH token kinds (character + image), sitting above the token so it
// never overlaps the 8 resize handles. Mirrors TokenResizeHandles: this renders the affordance and
// reports the grab; the angle math lives in useTokenRotate.
export default function TokenRotateHandle({ onRotateStart }) {
  const { t } = useTranslation();
  return (
    <div
      className="token-rotate-handle"
      onMouseDown={onRotateStart}
      title={t('scenes.rotateToken')}
    >
      <RotateRightIcon style={{ fontSize: 14 }} />
    </div>
  );
}
```

- [ ] **Step 6: Add the styles**

In `warhammer-battle-helper-front/src/style.css`, immediately after the `.token-resize-handle--sw` rule (currently line 10818), add:

```css
/* Rotate chrome — sits above the token's north edge, clear of the 8 resize handles. Shared by
   character tokens and token-layer images, matching .token-resize-handle's look. */
.token-rotate-handle {
  position: absolute;
  top: -26px;
  left: 50%;
  transform: translateX(-50%);
  width: 18px;
  height: 18px;
  background: rgba(201, 151, 91, 0.8);
  border: 1px solid #7a5c42;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  cursor: grab;
  z-index: 30;
  pointer-events: auto;
}
.token-rotate-handle:active { cursor: grabbing; }
```

- [ ] **Step 7: Add the translations**

In `warhammer-battle-helper-front/src/locales/en/translation.json`, in the `scenes` object next to `"rotateImage"` (line 802):

```json
    "rotateToken": "Rotate token",
```

In `warhammer-battle-helper-front/src/locales/pl/translation.json`, same place:

```json
    "rotateToken": "Obróć token",
```

- [ ] **Step 8: Verify both locale files still parse**

```bash
cd warhammer-battle-helper-front && node -e "['en','pl'].forEach(l => { const t = require('./src/locales/'+l+'/translation.json'); if (!t.scenes.rotateToken) throw new Error('missing key in '+l); console.log(l, '->', t.scenes.rotateToken); })"
```

Expected:
```
en -> Rotate token
pl -> Obróć token
```

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/useTokenRotate.js warhammer-battle-helper-front/src/components/scene/useTokenRotate.test.jsx warhammer-battle-helper-front/src/components/scene/TokenRotateHandle.jsx warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat(scene): shared useTokenRotate hook + rotate handle (FEATURE-152)"
```

---

### Task 3: Persist `rotation` on a character token (backend)

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/Game.go:114-144` (`GameCharacter`) and `:271-278` (`UpdateSceneCharacterRequest`)
- Modify: `warhammer-battle-helper-backend/internal/repository/GameRepository.go:1065-1086`

**Interfaces:**
- Consumes: nothing.
- Produces: `PUT /games/:gameId/scenes/:sceneId/characters/:characterId` accepts `{"rotation": <float>}`; `GameCharacter` serialises `rotation` in its JSON. Task 5 calls this endpoint.

**Background:** The handler (`SceneHandler.UpdateSceneCharacter`, `:191`) and the service (`GameService.UpdateSceneCharacterGeometry`, `:1552`) pass the whole request struct through untouched, so only the model and the repository need editing. The repository builds a partial `$set` as a chain of six identical `if req.X != nil` blocks; this adds a seventh. Scene images already have this field (`SceneImage.Rotation`, `:300`) — mirror its tags.

There is no unit-test harness for game-document repository methods (`UserRepository_test.go` is the only repository test), so verification here is a compile plus a live request in Task 5.

- [ ] **Step 1: Add the field to `GameCharacter`**

In `warhammer-battle-helper-backend/internal/models/Game.go`, inside `GameCharacter`, directly after the `Killed` field (line 131):

```go
	// Rotation is the token's facing in degrees (0 = unrotated). Purely visual: the token's grid
	// footprint (W/H) is unaffected, matching how scene images treat rotation. Plain placement
	// data, not gear, so it survives token masking and every viewer sees the same angle.
	Rotation  float64            `bson:"rotation,omitempty" json:"rotation,omitempty"`
```

- [ ] **Step 2: Add the field to the update request**

In the same file, inside `UpdateSceneCharacterRequest` (line 271), after `H`:

```go
	Rotation  *float64 `json:"rotation,omitempty"`
```

- [ ] **Step 3: Persist it**

In `warhammer-battle-helper-backend/internal/repository/GameRepository.go`, in `UpdateSceneCharacterGeometry`, after the `req.H` block (line 1080):

```go
	if req.Rotation != nil {
		setFields["scenes.$[scene].characters.$[char].rotation"] = *req.Rotation
	}
```

- [ ] **Step 4: Build and verify**

```bash
cd warhammer-battle-helper-backend && go build ./... && go vet ./internal/models ./internal/repository
```

Expected: no output (success).

- [ ] **Step 5: Confirm the field is wired end to end**

```bash
cd warhammer-battle-helper-backend && grep -n "rotation" internal/models/Game.go internal/repository/GameRepository.go | grep -i "characters\|GameCharacter\|Rotation"
```

Expected: at least three hits — the `GameCharacter` field, the request field, and the `scenes.$[scene].characters.$[char].rotation` `$set` entry.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/Game.go warhammer-battle-helper-backend/internal/repository/GameRepository.go
git commit -m "feat(scene): persist rotation on character token placements (FEATURE-152)"
```

---

### Task 4: Wire the image token

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx`
- Modify: `warhammer-battle-helper-front/src/style.css` (add `.scene-image__upright`)

**Interfaces:**
- Consumes: `canManipulateToken` (Task 1), `useTokenRotate` and `TokenRotateHandle` (Task 2).
- Produces: nothing new for later tasks.

**Background:** `SceneImage` renders both background/GM images (full editor: 8 handles + rotate, only on the armed layer) and token-layer images. Rotation already exists for the former; this task makes the hook the single implementation for both, and adds the token-layer rotate handle.

The container already carries `transform: rotate(...)` (line 444) and the handles live inside it, so they rotate with the shape — correct, keep it. The consequence is that `ImageTokenOverlay` rotates too, which would tip HP numbers on their side. Fix by wrapping it in a counter-rotating node: `.token-overlay` is `position: absolute; inset: 0`, so its transform origin coincides with the container centre and `rotate(θ)` composed with `rotate(-θ)` is exactly the identity.

- [ ] **Step 1: Replace the hand-rolled rotation with the hook**

Delete lines 245–292 of `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx` — the whole block from the `// --- Rotate ---` comment through the closing of the `useEffect` that listens for `mousemove`/`mouseup` — and put this in its place:

```jsx
  // --- Rotate ---
  const saveRotation = useCallback(async (newRotation) => {
    try {
      await updateSceneImage(gameId, sceneId, image.id, { rotation: newRotation });
    } catch (err) {
      console.error('Failed to update scene image rotation:', err);
    }
  }, [gameId, sceneId, image.id]);

  const commitRotation = useCallback((finalRotation) => {
    justFinishedRotatingRef.current = true;
    saveRotation(finalRotation);
  }, [saveRotation]);

  const { isRotating, handleRotateStart } = useTokenRotate({
    containerRef,
    rotation,
    setRotation,
    enabled: isGM && !image.locked,
    onCommit: commitRotation,
  });
```

- [ ] **Step 2: Remove the now-dead local state and imports**

Delete the `const [isRotating, setIsRotating] = useState(false);` declaration (line 29) and the `const rotateStartRef = useRef(null);` declaration (line 35) — the hook owns both now. Keep `const [rotation, setRotation] = useState(image.rotation || 0);` and `justFinishedRotatingRef`, which the prop-sync effect still reads.

Then remove `snapAngle` from the imports if nothing else in the file uses it, and add the two new imports next to the existing `TokenResizeHandles` import (line 11):

```jsx
import TokenRotateHandle from './TokenRotateHandle';
import { useTokenRotate } from './useTokenRotate';
import { canManipulateToken } from '../../utils/tokenManipulation';
```

Verify no stale references remain:

```bash
cd warhammer-battle-helper-front && grep -n "setIsRotating\|rotateStartRef\|snapAngle" src/components/scene/SceneImage.jsx
```

Expected: no output.

- [ ] **Step 3: Gate the token handles with the predicate**

Replace the token-image handle block (currently lines 514–518):

```jsx
        {/* Token images: the SAME shared resize handles as character tokens (selected, in the
            token-manipulation context — default or pan tool). No rotate, matching characters. */}
        {isToken && selected && isGM && !image.locked && (editingLayer === null || activeTool === 'pan') && (
          <TokenResizeHandles onResizeStart={handleResizeStart} />
        )}
```

with:

```jsx
        {/* Token images: the SAME shared chrome as character tokens — resize handles plus a rotate
            handle, shown for a lone token under either the pan or the select tool. */}
        {isToken && canManipulateToken({
          allowed: isGM,
          locked: image.locked,
          editingLayer,
          activeTool,
          imageEditLayer,
          activeSelected: selected,
          groupSelected: multiSelected,
          multiSelectActive,
        }) && (
          <>
            <TokenResizeHandles onResizeStart={handleResizeStart} />
            <TokenRotateHandle onRotateStart={handleRotateStart} />
          </>
        )}
```

- [ ] **Step 4: Keep the overlay upright**

Replace the `ImageTokenOverlay` block (currently lines 478–488):

```jsx
        {/* States/HP ring for tokens-layer images */}
        {isToken && (
          <ImageTokenOverlay
            image={image}
            gameId={gameId}
            sceneId={sceneId}
            selected={selected}
            canEdit={isGM}
            gameSystem={gameSystem}
          />
        )}
```

with:

```jsx
        {/* States/HP ring for tokens-layer images. Counter-rotated so HP numbers stay readable
            while the artwork turns: .token-overlay is inset:0, so its origin is the container
            centre and rotate(-r) exactly undoes the container's rotate(r). */}
        {isToken && (
          <div
            className="scene-image__upright"
            style={{ transform: `rotate(${-rotation}deg)` }}
          >
            <ImageTokenOverlay
              image={image}
              gameId={gameId}
              sceneId={sceneId}
              selected={selected}
              canEdit={isGM}
              gameSystem={gameSystem}
            />
          </div>
        )}
```

- [ ] **Step 5: Add the wrapper style**

In `warhammer-battle-helper-front/src/style.css`, directly after the `.token-rotate-handle:active` rule added in Task 2:

```css
/* Counter-rotation wrapper: cancels the token container's rotation for overlay chrome that must
   stay upright (HP numbers, state slots). Pointer-events pass through — the overlay's own
   controls opt back in. */
.scene-image__upright {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
```

- [ ] **Step 6: Verify the app compiles**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "DrawingToolbar|LayerSelector|tokenManipulation|useTokenRotate"
```

Expected: PASS, all suites (this exercises the shared import graph and catches syntax or import errors).

- [ ] **Step 7: Verify behaviour in the running app**

Start the app, open a scene as GM, and check each of these:

1. Pan tool, click a tokens-layer image → 8 resize handles **and** a rotate handle above it.
2. Drag the rotate handle → the artwork turns, the HP/state ring stays upright, the token's centre does not move.
3. Release near a 45° multiple → it snaps; release far from one → the free angle holds.
4. Reload the page → the angle persisted.
5. Select tool with the **tokens** layer armed, click one image → the same handles appear.
6. Marquee two tokens → all handles disappear.
7. Select tool with the **background** layer armed → background images still rotate as before, with their handles turning along with the image.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneImage.jsx warhammer-battle-helper-front/src/style.css
git commit -m "feat(scene): image tokens rotate + resize under both tools (FEATURE-152)"
```

---

### Task 5: Wire the character token

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx`
- Modify: `warhammer-battle-helper-front/src/components/scene/MapTokensLayer.jsx`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx`
- Modify: `warhammer-battle-helper-front/src/components/DndContext.jsx`

**Interfaces:**
- Consumes: `canManipulateToken` (Task 1), `useTokenRotate` / `TokenRotateHandle` (Task 2), the `rotation` field on the update endpoint (Task 3).
- Produces: prop `onCommitRotate(characterId, rotationDegrees)` threaded `DndContext → SceneViewport → MapTokensLayer → MapCharacterToken`; prop `rotation` on `MapCharacterToken`.

**Background:** Only `.map-char-token__avatar` rotates — the container stays put, so the name label and `<TokenOverlay>` need no counter-rotation and the resize handles stay axis-aligned. `.map-char-token__avatar` is `position: absolute; inset: 0; border-radius: 50%; overflow: hidden` (`style.css:10761-10766`), so its origin is already the token centre.

The existing `charGeomOverride` state (`DndContext.jsx:55`) holds optimistic `{w, h}` per character id so a resize survives the server round trip; rotation joins it.

- [ ] **Step 1: Add rotation state and the hook to the token**

In `warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx`, add to the imports (after line 4):

```jsx
import TokenRotateHandle from './TokenRotateHandle';
import { useTokenRotate } from './useTokenRotate';
import { canManipulateToken } from '../../utils/tokenManipulation';
```

Add `rotation = 0` and `onCommitRotate` to the props (in the destructuring at lines 11-20 — put `rotation = 0,` next to `w, h` and `onCommitRotate` next to `onCommitResize`).

After the `const [isResizing, setIsResizing] = useState(false);` line (line 25), add:

```jsx
  const [angle, setAngle] = useState(rotation);
  const containerRef = useRef(null);
  const justRotatedRef = useRef(false);
```

After the size-sync effect (line 45), add the matching sync:

```jsx
  useEffect(() => {
    if (justRotatedRef.current) { justRotatedRef.current = false; return; }
    setAngle(rotation);
  }, [rotation]);
```

- [ ] **Step 2: Drive the hook**

After the resize `useEffect` (line 174), add:

```jsx
  // --- Rotate ---
  // Only the avatar badge turns; the name and the states/HP overlay stay upright so their text
  // never ends up sideways. Rotation is purely visual — the token's grid footprint (w/h) is
  // unchanged, matching how scene images behave.
  const commitRotation = useCallback((finalAngle) => {
    justRotatedRef.current = true;
    onCommitRotate?.(character.id, finalAngle);
  }, [character.id, onCommitRotate]);

  const { handleRotateStart } = useTokenRotate({
    containerRef,
    rotation: angle,
    setRotation: setAngle,
    enabled: isGM || canDrag,
    onCommit: commitRotation,
  });
```

- [ ] **Step 3: Replace the resize gate with the shared predicate**

Replace line 129:

```jsx
  const canResize = (isGM || canDrag) && (!editingLayer || activeTool === 'pan');
```

with:

```jsx
  // One shared predicate decides both handle kinds, so the pan and select tools can never drift
  // apart again (see utils/tokenManipulation.js).
  const showHandles = canManipulateToken({
    allowed: isGM || canDrag,
    locked: false, // character placements have no lock concept
    editingLayer,
    activeTool,
    imageEditLayer,
    activeSelected: selected,
    groupSelected: multiSelected,
    multiSelectActive,
  });
```

Add `multiSelectActive = false,` to the props destructuring (next to `multiSelected = false,` on line 19).

- [ ] **Step 4: Render the rotation and the handles**

Attach the ref to the root element by adding `ref={containerRef}` to the opening `<div className={...map-char-token...}>` (line 229).

Replace the avatar block (lines 246–248):

```jsx
      <div className="map-char-token__avatar">
        <Avatar key={displayAvatar || 'default'} src={displayAvatar} />
      </div>
```

with:

```jsx
      <div className="map-char-token__avatar" style={{ transform: `rotate(${angle}deg)` }}>
        <Avatar key={displayAvatar || 'default'} src={displayAvatar} />
      </div>
```

Replace the handles line (line 271):

```jsx
      {canResize && selected && <TokenResizeHandles onResizeStart={handleResizeStart} />}
```

with:

```jsx
      {showHandles && (
        <>
          <TokenResizeHandles onResizeStart={handleResizeStart} />
          <TokenRotateHandle onRotateStart={handleRotateStart} />
        </>
      )}
```

- [ ] **Step 5: Stop the rotate handle from starting a drag**

`handleMouseDown` skips presses on the resize handles and the overlay (line 53); the rotate handle needs the same exclusion. Replace line 53:

```jsx
    if (e.target.closest('.map-char-token__handle') || e.target.closest('.token-overlay')) return;
```

with:

```jsx
    if (e.target.closest('.map-char-token__handle') || e.target.closest('.token-overlay')) return;
    if (e.target.closest('.token-rotate-handle') || e.target.closest('.token-resize-handle')) return;
```

- [ ] **Step 6: Thread the props down**

In `warhammer-battle-helper-front/src/components/scene/MapTokensLayer.jsx`, add `onCommitRotate` to the destructured props (next to `onCommitResize` on line 16), and add these two props to `<MapCharacterToken>` (after `onCommitResize={onCommitResize}` on line 77):

```jsx
          rotation={item.data.rotation}
          onCommitRotate={onCommitRotate}
```

Also add `multiSelectActive={multiSelectActive}` to `<MapCharacterToken>` — `SceneImage` already receives it but the character token does not.

In `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx`, add `onCommitRotate` to the destructured props next to `onCommitResize` (line 46), and pass `onCommitRotate={onCommitRotate}` to `<MapTokensLayer>` (next to `onCommitResize={onCommitResize}` on line 754).

- [ ] **Step 7: Add the commit handler**

In `warhammer-battle-helper-front/src/components/DndContext.jsx`, after `handleResizeCharacter` (which ends at line 505), add:

```jsx
  // Commit a character token's rotation. Same optimistic-override + PUT pattern as the resize
  // above; the server broadcasts over WS and every client refetches.
  const handleRotateCharacter = async (characterId, rotation) => {
    if (!gameId || !token) return;
    const sid = sceneIdRef.current;
    if (!sid) return;
    setCharGeomOverride(prev => ({ ...prev, [characterId]: { ...prev[characterId], rotation } }));
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/scenes/${sid}/characters/${characterId}`, {
        method: 'PUT',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ rotation }),
      });
    } catch (error) {
      console.error('Error rotating character:', error);
    }
  };
```

In the same file, in the `placedCharacters` mapping (lines 1010–1022), add after the `h:` line:

```jsx
        rotation: ov?.rotation ?? ((sc && sc.rotation) || 0),
```

Then pass the handler to `<SceneViewport>` (line 1141) by adding `onCommitRotate={handleRotateCharacter}` next to `onCommitResize={handleResizeCharacter}`.

- [ ] **Step 8: Verify the existing suites still pass**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "tokenManipulation|useTokenRotate|tokenGeometry|DrawingToolbar|LayerSelector"
```

Expected: PASS, all suites.

- [ ] **Step 9: Verify behaviour in the running app**

As GM, with a character token on the map:

1. Pan tool, click the token → resize handles **and** a rotate handle appear.
2. Drag the rotate handle → the avatar circle turns; the name label and the HP/state ring stay upright; the token does not move.
3. Reload → the angle persisted.
4. Select tool, tokens layer armed, click one token → the same handles.
5. Marquee two tokens → no handles.
6. Press the rotate handle and drag → the token must **not** move (Step 5's exclusion).

- [ ] **Step 10: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx warhammer-battle-helper-front/src/components/scene/MapTokensLayer.jsx warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx warhammer-battle-helper-front/src/components/DndContext.jsx
git commit -m "feat(scene): character tokens rotate + resize under both tools (FEATURE-152)"
```

---

### Task 6: Group rotation reset and adapter consistency

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/tokenGeometry.js:102-115`
- Modify: `warhammer-battle-helper-front/src/utils/tokenGeometry.test.js`
- Modify: `warhammer-battle-helper-front/src/components/DndContext.jsx:236-239`

**Interfaces:**
- Consumes: `handleRotateCharacter` from Task 5.
- Produces: nothing for later tasks.

**Background:** `handleGroupResetRotation` backs the "Reset rotation (all)" entry in the multi-token context menu. It currently loops over images only, because characters had no rotation to reset — after Task 5 that makes the menu entry lie. Separately, `characterToMapToken` hardcodes `rotation: 0` behind a comment claiming characters do not rotate; no consumer reads that field today, but leaving it would misstate the model.

- [ ] **Step 1: Write the failing test**

In `warhammer-battle-helper-front/src/utils/tokenGeometry.test.js`, add:

```js
describe('characterToMapToken rotation', () => {
  it('carries the placement rotation through', () => {
    const tk = characterToMapToken({ characterId: 'c1', positionX: 1, positionY: 2, w: 1, h: 1, rotation: 45 });
    expect(tk.rotation).toBe(45);
  });

  it('defaults to 0 for a placement saved before rotation existed', () => {
    const tk = characterToMapToken({ characterId: 'c1', positionX: 1, positionY: 2, w: 1, h: 1 });
    expect(tk.rotation).toBe(0);
  });
});
```

Check the file's existing import line and make sure `characterToMapToken` is included; add it if not.

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern tokenGeometry
```

Expected: FAIL — `expect(received).toBe(expected) // Expected: 45, Received: 0`.

- [ ] **Step 3: Fix the adapter**

In `warhammer-battle-helper-front/src/utils/tokenGeometry.js`, in `characterToMapToken`, replace line 110:

```js
    rotation: 0, // characters don't rotate (unreadable avatar + no facing in the rules)
```

with:

```js
    rotation: gc.rotation || 0, // visual facing only — never changes the token's w/h footprint
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern tokenGeometry
```

Expected: PASS.

- [ ] **Step 5: Extend the group reset to characters**

In `warhammer-battle-helper-front/src/components/DndContext.jsx`, replace `handleGroupResetRotation` (lines 236–239):

```jsx
  const handleGroupResetRotation = useCallback(() => {
    const sid = sceneIdRef.current;
    groupImages().forEach(img => updateSceneImage(gameId, sid, img.id, { rotation: 0 }).catch(e => console.error(e)));
  }, [groupImages, gameId]);
```

with:

```jsx
  // Resets both token kinds — characters gained rotation in FEATURE-152, and leaving them out
  // would make the "reset all" menu entry lie about what it touched.
  const handleGroupResetRotation = useCallback(() => {
    const sid = sceneIdRef.current;
    groupImages().forEach(img => updateSceneImage(gameId, sid, img.id, { rotation: 0 }).catch(e => console.error(e)));
    selectedTokens
      .filter(t => t.kind === 'char')
      .forEach(t => handleRotateCharacter(t.id, 0));
  }, [groupImages, gameId, selectedTokens]);
```

If `handleRotateCharacter` is declared *after* this callback in the file, move `handleGroupResetRotation` below it — a `const` arrow function is not hoisted, so referencing it earlier throws at call time.

Confirm the shape of `selectedTokens` entries before relying on `t.kind === 'char'`:

```bash
cd warhammer-battle-helper-front && grep -n "kind: 'char'\|kind === 'char'" src/components/DndContext.jsx src/components/scene/SceneViewport.jsx | head
```

Expected: hits showing character entries use `kind: 'char'` (not `'character'`).

- [ ] **Step 6: Verify behaviour in the running app**

1. Rotate one character token and one image token to different angles.
2. Marquee-select both.
3. Right-click → "Reset rotation (all)".
4. Both return to 0°.

- [ ] **Step 7: Run the full frontend suite**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test
```

Expected: PASS, all suites.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/tokenGeometry.js warhammer-battle-helper-front/src/utils/tokenGeometry.test.js warhammer-battle-helper-front/src/components/DndContext.jsx
git commit -m "feat(scene): group rotation reset covers character tokens (FEATURE-152)"
```

---

## Out of scope

Recorded during brainstorming, deliberately not in this plan:

- Rotating a multi-token selection — turning around the group centroid moves each token's centre, so it writes positions, not just angles.
- A context menu for character tokens (`MapCharacterToken` has none today), which is where a per-token "reset rotation" would live.
- `docs/superpowers/specs/FEATURE-153.md` — the cells-versus-pixels unit split.
- `docs/superpowers/specs/FEATURE-154.md` — free-mode character drags failing to persist.
