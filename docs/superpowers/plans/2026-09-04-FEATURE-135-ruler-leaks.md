# FEATURE-135 — Ruler Leaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the distance ruler from telling players two things they must not know — that a token is being dragged in from the GM staging margin, and how a token moves underneath fog of war.

**Architecture:** Two independent frontend changes. (1) `hooks/useDragRuler.js` grows a second privacy predicate, `isOffscenePoint`, OR-ed into the existing `isPrivateDrag` gate that is decided once per drag; it needs the scene's grid dimensions, which `DndContext.jsx` already computes. (2) `MapRulerOverlay` takes a `zIndex` prop and `SceneViewport` renders it twice — other players' rulers at `28` (below `FogLayer`'s `30`), the local ruler at today's `40`.

**Tech Stack:** React 18, Jest + React Testing Library (CRA-managed), no new dependencies.

Spec: `docs/superpowers/specs/2026-09-04-FEATURE-135-ruler-leaks-design.md`

## Global Constraints

- Run tests from `warhammer-battle-helper-front/`: `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Bare `npx jest` does not work — CRA owns the config.
- Known baseline failure: `App.test.js` (axios ESM). Not a regression, ignore it.
- No i18n keys are added by this plan. `MapRulerOverlay` renders no translated strings.
- Comments in code are written in English, matching the surrounding files.
- Fail closed on privacy: when in doubt, do not broadcast. A missing ruler beats a leaked position.

---

### Task 1: Off-scene start keeps the drag ruler local

**Files:**
- Modify: `warhammer-battle-helper-front/src/hooks/useDragRuler.js`
- Modify: `warhammer-battle-helper-front/src/hooks/useDragRuler.test.js`
- Modify: `warhammer-battle-helper-front/src/components/DndContext.jsx:70-83` (the `useDragRuler({...})` call)

**Interfaces:**
- Consumes: `isPrivateDrag(tokens, { images, characters })` — already exported from `useDragRuler.js`.
- Predicate name: originally `isOffsceneStart`; fix wave 2 (Zmiana 1c in the spec) renamed it to the position-neutral `isOffscenePoint`, because the manual ruler also applies it to the endpoint of the line. The whole plan below uses the new name.
- Produces: `isOffscenePoint(point, { gridWidth, gridHeight })` → `boolean`, named export from `useDragRuler.js`. `point` is `{ col, row }` in cells. `useDragRuler` gains two props: `gridWidth`, `gridHeight` (numbers).

- [ ] **Step 1: Write the failing tests**

Two edits to `warhammer-battle-helper-front/src/hooks/useDragRuler.test.js`.

First, the shared `setup()` helper must pass grid dimensions — without them the new gate fails closed and every existing broadcast test would break. Replace the existing helper (lines 15-24) with:

```js
const GRID = { gridWidth: 20, gridHeight: 20 };

function setup(sendMessage, overrides = {}) {
  return renderHook(() => useDragRuler({
    sendMessage,
    sceneId: 'scene-1',
    userId: 'gm-1',
    userName: 'GM',
    images: IMAGES,
    characters: CHARACTERS,
    ...GRID,
    ...overrides,
  }));
}
```

Second, extend the import on line 2 and append two new describe blocks at the end of the file:

```js
import useDragRuler, { isPrivateDrag, isOffscenePoint } from './useDragRuler';
```

```js
describe('isOffscenePoint', () => {
  const grid = { gridWidth: 20, gridHeight: 20 };

  test('a point inside the grid is on-scene', () => {
    expect(isOffscenePoint({ col: 0, row: 0 }, grid)).toBe(false);
    expect(isOffscenePoint({ col: 10.5, row: 3.5 }, grid)).toBe(false);
    expect(isOffscenePoint({ col: 20, row: 20 }, grid)).toBe(false); // the far edge still counts
  });

  test('a point in the staging margin is off-scene', () => {
    expect(isOffscenePoint({ col: -5, row: 10 }, grid)).toBe(true);
    expect(isOffscenePoint({ col: 25, row: 10 }, grid)).toBe(true);
    expect(isOffscenePoint({ col: 10, row: -0.5 }, grid)).toBe(true);
    expect(isOffscenePoint({ col: 10, row: 20.5 }, grid)).toBe(true);
  });

  test('unusable grid dimensions fail closed', () => {
    expect(isOffscenePoint({ col: 1, row: 1 }, {})).toBe(true);
    expect(isOffscenePoint({ col: 1, row: 1 }, { gridWidth: 20 })).toBe(true);
    expect(isOffscenePoint({ col: 1, row: 1 }, { gridWidth: NaN, gridHeight: 20 })).toBe(true);
  });

  test('an unusable point fails closed', () => {
    expect(isOffscenePoint(null, grid)).toBe(true);
    expect(isOffscenePoint({ col: NaN, row: 1 }, grid)).toBe(true);
  });
});

describe('useDragRuler off-scene gate', () => {
  test('keeps the ruler local when the drag starts in the staging margin', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: -4, row: 5 }, [{ kind: 'char', id: 'char-visible' }]));

    // The dragger still gets their own readout — only the broadcast is suppressed.
    expect(result.current.dragRuler).toEqual({ from: { col: -4, row: 5 }, to: { col: -4, row: 5 } });

    act(() => result.current.onMeasureMove({ col: 6, row: 5 }));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local when the drag starts past the far grid edge', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 5, row: 24 }, [{ kind: 'char', id: 'char-visible' }]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local when the grid dimensions are missing', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage, { gridWidth: undefined, gridHeight: undefined });

    act(() => result.current.onMeasureStart({ col: 1, row: 1 }, [{ kind: 'char', id: 'char-visible' }]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('a drag that starts on-scene and moves off-scene keeps broadcasting', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 3, row: 3 }, [{ kind: 'char', id: 'char-visible' }]));
    act(() => result.current.onMeasureMove({ col: -8, row: 3 }));

    expect(sendMessage).toHaveBeenLastCalledWith('MAP_RULER', expect.objectContaining({
      from: { col: 3, row: 3 },
      to: { col: -8, row: 3 },
      active: true,
    }));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `warhammer-battle-helper-front/`:

```bash
CI=true npm test -- --watchAll=false --testPathPattern=useDragRuler
```

Expected: FAIL. `isOffscenePoint is not a function` in the predicate block, and the gate tests fail because `sendMessage` was called.

- [ ] **Step 3: Add the predicate and wire it into the gate**

In `warhammer-battle-helper-front/src/hooks/useDragRuler.js`, add below `isPrivateDrag`:

```js
// True when a point lies outside the grid — the GM staging ring, or anything past an edge. Players
// never render that area, so a ruler endpoint sitting there tells them a token is coming onto the
// map and from which side, even when the token itself is perfectly visible (FEATURE-135).
//
// The name is deliberately position-neutral: the two rulers apply it to different ends of the line.
// The DRAG ruler judges only the START (see onMeasureStart below); the MANUAL ruler judges the start
// AND every endpoint it would broadcast (see useMapRuler, added later in this plan). Same predicate,
// two policies.
//
// Fail closed like isPrivateDrag: a point or grid size we cannot read counts as off-scene.
export function isOffscenePoint(point, { gridWidth, gridHeight } = {}) {
  if (!point || !Number.isFinite(point.col) || !Number.isFinite(point.row)) return true;
  if (!Number.isFinite(gridWidth) || !Number.isFinite(gridHeight)) return true;
  return point.col < 0 || point.col > gridWidth || point.row < 0 || point.row > gridHeight;
}
```

Extend the hook signature and the mirrored ref (the mirror must carry the grid too, for the same
reason it carries images/characters — a drag starting right after a scene swap must not read stale
dimensions):

```js
export default function useDragRuler({ sendMessage, sceneId, userId, userName, images, characters, gridWidth, gridHeight }) {
```

```js
  const sceneRef = useRef({ images, characters, gridWidth, gridHeight });
  useLayoutEffect(() => { sceneRef.current = { images, characters, gridWidth, gridHeight }; }, [images, characters, gridWidth, gridHeight]);
```

And OR the two predicates in `onMeasureStart`:

```js
    privateRef.current = isPrivateDrag(tokens, sceneRef.current)
      || isOffscenePoint(center, sceneRef.current);
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=useDragRuler
```

Expected: PASS, all tests in the file, including the pre-existing BUG-178 ones.

- [ ] **Step 5: Pass the grid dimensions from DndContext**

`warhammer-battle-helper-front/src/components/DndContext.jsx` already computes `gridWidth` and
`gridHeight` at line 43. Add them to the `useDragRuler` call (around line 76):

```jsx
  } = useDragRuler({
    sendMessage,
    sceneId: currentSceneId,
    userId,
    userName,
    images: currentScene?.images || [],
    characters: currentScene?.characters || [],
    gridWidth,
    gridHeight,
  });
```

Also update the comment above that block (line 70) so it names both gates:

```jsx
  // Live drag ruler + its broadcast gate (a hidden token's ruler, or one starting in the GM staging
  // margin, stays local) — hooks/useDragRuler.js.
```

- [ ] **Step 6: Verify nothing else regressed**

```bash
CI=true npm test -- --watchAll=false --testPathPattern="useDragRuler|useGroupDrag|tokenGeometry"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/hooks/useDragRuler.js warhammer-battle-helper-front/src/hooks/useDragRuler.test.js warhammer-battle-helper-front/src/components/DndContext.jsx
git commit -m "fix(front): FEATURE-135 keep the drag ruler local when it starts off-scene

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Fog covers other players' rulers

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/MapRulerOverlay.jsx`
- Create: `warhammer-battle-helper-front/src/components/scene/MapRulerOverlay.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx:636-666` (the `displayRulers` assembly) and `:916-922` (the `<MapRulerOverlay />` render)

**Interfaces:**
- Consumes: nothing from Task 1 — the two tasks are independent.
- Produces: `MapRulerOverlay` accepts a new optional prop `zIndex` (number, default `40`). Existing props are unchanged: `rulers`, `cellDistance`, `unit`, `canvasWidth`, `canvasHeight`.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/scene/MapRulerOverlay.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import MapRulerOverlay from './MapRulerOverlay';

const ruler = (key, name) => ({
  key,
  name,
  from: { col: 1, row: 1 },
  to: { col: 4, row: 1 },
  distance: 3,
  color: '#ffe08a',
  aoe: false,
});

const renderOverlay = (props) => render(
  <MapRulerOverlay rulers={[ruler('self', null)]} canvasWidth={800} canvasHeight={600} {...props} />,
);

describe('MapRulerOverlay', () => {
  test('defaults to the top-of-stack z-index', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('.map-ruler-overlay')).toHaveStyle({ zIndex: '40' });
  });

  test('honours an explicit z-index so the fog layer can sit above it', () => {
    const { container } = renderOverlay({ zIndex: 28 });
    expect(container.querySelector('.map-ruler-overlay')).toHaveStyle({ zIndex: '28' });
  });

  test('renders one badge per ruler, labelled with the measuring player', () => {
    renderOverlay({
      rulers: [ruler('p1', 'Alice'), ruler('p2', 'Bob')],
      cellDistance: 5,
      unit: 'ft',
    });
    expect(screen.getAllByText('15 ft')).toHaveLength(2);
    expect(screen.getByText('· Alice')).toBeInTheDocument();
    expect(screen.getByText('· Bob')).toBeInTheDocument();
  });

  test('renders nothing when there are no rulers', () => {
    const { container } = renderOverlay({ rulers: [] });
    expect(container.querySelector('.map-ruler-overlay')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=MapRulerOverlay
```

Expected: FAIL on the explicit z-index case — the overlay still hardcodes `zIndex: 40`.

- [ ] **Step 3: Add the zIndex prop**

In `warhammer-battle-helper-front/src/components/scene/MapRulerOverlay.jsx`, extend the signature
and the inline style, and note why the prop exists:

```jsx
// Presentational overlay for measuring rulers — the local one plus every other player's,
// all ephemeral. Coordinates are in canvas pixels (col/row * CELL_SIZE); the parent already
// lives in scene space (zoom is applied by an ancestor transform).
//
// zIndex is a prop because the stack is split (FEATURE-135): other players' rulers render BELOW
// FogLayer (30) so a token moved under fog does not leak its path, while the local ruler stays on
// top so measuring toward a fogged area still shows you your own line and readout.
export default function MapRulerOverlay({ rulers, cellDistance = 1, unit = '', canvasWidth, canvasHeight, zIndex = 40 }) {
```

```jsx
      style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none', zIndex }}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=MapRulerOverlay
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Split the rulers into two overlays in SceneViewport**

In `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx`, replace the single
`displayRulers` array (starting at the comment `// Own live ruler + every other player's...`) with
two arrays. Keep the bodies of the pushes exactly as they are today — only the target array and the
comment change:

```jsx
  // Rulers are split across two overlays so the fog layer can sit between them (FEATURE-135):
  // other players' rulers render under the fog (a token moved under fog must not leak its path),
  // the local one stays on top (you keep your own line and readout when measuring toward fog).
  const selfRulers = [];
  const remoteRulers = [];
  if (ruler.ruler) {
    // Manual ruler tool → AoE circle when the toggle is on.
    selfRulers.push({ key: 'self', from: ruler.ruler.from, to: ruler.ruler.to, distance: ruler.distance, name: null, color: '#ffe08a', aoe: aoeEnabled });
  }
  // Live readout while dragging a token (local to the dragger) — no AoE circle.
  if (dragRuler) {
    selfRulers.push({
      key: 'drag',
      from: dragRuler.from,
      to: dragRuler.to,
      distance: distanceBetween({ col: dragRuler.from.col, row: dragRuler.from.row, w: 0, h: 0 }, { col: dragRuler.to.col, row: dragRuler.to.row, w: 0, h: 0 }, measurementMetric),
      name: null,
      color: '#ffe08a',
      aoe: false,
    });
  }
  mapRulers.forEach(r => {
    if (r.userId === userId) return; // own echo — already shown locally
    remoteRulers.push({
      key: r.userId,
      from: r.from,
      to: r.to,
      distance: distanceBetween({ col: r.from.col, row: r.from.row, w: 0, h: 0 }, { col: r.to.col, row: r.to.row, w: 0, h: 0 }, measurementMetric),
      name: r.name,
      color: rulerColorFor(r.userId),
      aoe: !!r.aoe, // remote ruler carries its own AoE flag (measurer's toggle)
    });
  });
```

- [ ] **Step 6: Render both overlays**

In the same file, replace the single `<MapRulerOverlay ... rulers={displayRulers} ... />` (around
line 916, just after the `DrawingLayer` block) with two instances. Both are siblings inside
`content`, so only `zIndex` decides the order — DOM order is irrelevant:

```jsx
                {/* Other players' rulers: below FogLayer (30) — see MapRulerOverlay for why. */}
                <MapRulerOverlay
                  rulers={remoteRulers}
                  cellDistance={cellDistance}
                  unit={distanceUnit}
                  canvasWidth={canvasSize.width}
                  canvasHeight={canvasSize.height}
                  zIndex={28}
                />

                {/* Own ruler: above the fog, so measuring toward a fogged area stays readable. */}
                <MapRulerOverlay
                  rulers={selfRulers}
                  cellDistance={cellDistance}
                  unit={distanceUnit}
                  canvasWidth={canvasSize.width}
                  canvasHeight={canvasSize.height}
                />
```

- [ ] **Step 7: Verify the whole scene suite still passes**

```bash
CI=true npm test -- --watchAll=false --testPathPattern="components/scene"
```

Expected: PASS. `App.test.js` is not in this pattern; if it appears, its axios ESM failure is the
known baseline.

Then confirm nothing references the removed identifier:

```bash
grep -rn "displayRulers" warhammer-battle-helper-front/src
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/MapRulerOverlay.jsx warhammer-battle-helper-front/src/components/scene/MapRulerOverlay.test.jsx warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx
git commit -m "fix(front): FEATURE-135 render other players' rulers beneath the fog layer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Manual verification in the running app

**Files:** none — this task only runs the app and observes.

**Interfaces:**
- Consumes: both changes from Tasks 1 and 2.
- Produces: nothing in code. A pass/fail report on the four scenarios below.

- [ ] **Step 1: Bring up the stack and open two sessions**

Follow `docs` / the local recipe: one browser profile logged in as the GM, a second (private window
or another profile) as a player in the same game, both on the same scene. The player must be a real
second account — the GM's own view can never demonstrate a leak.

- [ ] **Step 2: Scenario A — drag in from the staging margin**

GM parks a **visible** character token in the grey margin outside the grid, then drags it onto the
grid.

Expected: GM sees their own dashed ruler and distance badge. The player's screen shows **no** ruler
at any point during that drag.

- [ ] **Step 3: Scenario B — drag out to the staging margin**

GM drags a visible token from the grid out into the margin.

Expected: the player **does** see the ruler (this is the deliberate start-only rule — the token is
visible while it moves).

- [ ] **Step 4: Scenario C — move a token under fog**

With fog covering part of the scene, GM drags a visible token from one fogged cell to another.

Expected: on the player's screen the ruler line, arrowhead and distance badge are hidden by the fog.
On the GM's screen the ruler stays fully visible (own ruler, above the fog).

- [ ] **Step 5: Scenario D — the player's own ruler still works**

Player switches to measure mode and drags a ruler from an open area toward a fogged region.

Expected: the player's own line and badge remain visible all the way, including over the fog. The GM
sees that player's ruler through the semi-transparent fog, dimmed.

- [ ] **Step 6: Scenario E — the distance badge at the top edge**

Fog covers the **TOP ROW** of the grid. GM drags a visible token from one cell of that top row to
another, still under the fog. The player watches the strip of frame **above** the map, not only the
map itself.

Expected: nothing appears in that strip. The distance badge is translated ~28px above the line's
midpoint, so before the `clip` fix it painted outside the fog canvas and stayed readable there.
Line, arrowhead and badge must all be hidden.

- [ ] **Step 7: Scenario F — the manual ruler from the staging margin**

GM switches to **measure mode**, presses an image token parked in the grey staging margin, and drags
the ruler onto the grid.

Expected: the GM sees their own line and readout (magnetized to that token's centre). The player
sees **no** ruler at any point. Repeat with the endpoint dropped on a **hidden** token on the grid:
the GM's endpoint must **not** magnetize to it (that is the accepted snap trade-off), and the player
still sees the ruler start and end where the GM actually pointed.

- [ ] **Step 8: Report**

Report each scenario as pass/fail with what was actually observed. If any fails, stop and report —
do not patch blind.

---

## Notes for the reviewer

- The two tasks touch disjoint files except that both are frontend-only; they can be reviewed
  independently.
- Nothing here changes the server. `MAP_RULER` stays a dumb hub relay; both gates are client-side,
  which is the same trust model BUG-178 established — the client that owns the hidden information is
  the one that withholds it.
- No i18n keys, no CSS additions, no new dependencies.
