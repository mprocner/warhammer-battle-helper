# FEATURE-142 — Right-Drag Map Panning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore right-button drag-to-pan on the scene map so it works reliably on macOS and Windows.

**Architecture:** Three independent changes, each severing one link in the chain that made the old
implementation depend on browser event ordering. (1) Both scene context menus stop listening for
`contextmenu` — their existing `mousedown` capture listener already covers right-clicks, and the
`contextmenu` listener was what closed a freshly opened menu on Windows. (2) The viewport suppresses
the native menu with a **stateless** predicate read off the event itself (`e.isTrusted && e.button === 2`)
— no flag, no timer, so no race. (3) A new `useRightDragPan` hook owns the gesture: pan on drag,
replay a synthetic `contextmenu` on a click.

**Tech Stack:** React 19, Create React App 5 (`react-scripts test` → Jest + jsdom),
`@testing-library/react` 16, i18next.

**Spec:** `docs/superpowers/specs/2026-08-28-FEATURE-142-right-drag-pan-design.md`

## Global Constraints

- **Working directory:** `/Users/mateuszprocner/priv/warhammer-battle-helper/.claude/worktrees/FEATURE-142`.
  Branch `FEATURE-142`. Never `cd` to the shared checkout.
- **Test command:** `CI=true npm test -- --watchAll=false` from `warhammer-battle-helper-front/`.
  Single file: append `--testPathPattern=<name>`. Bare `npx jest` does NOT work (CRA owns the config).
- **Known baseline failure:** `src/App.test.js` fails with
  `SyntaxError: Cannot use import statement outside a module` (axios ESM). Pre-existing, not a regression.
  Baseline before this plan: **307 tests passed, 46 of 47 suites**.
- **jsdom limits, verified empirically in this worktree — the test code below already works around all three:**
  - `window.PointerEvent` is `undefined`. `fireEvent.pointerDown(...)` produces an event whose
    `button` and `clientX` are `undefined`. Construct a `MouseEvent` with the pointer type name instead
    and pass it through `fireEvent(node, event)` (which wraps in `act()`); React's
    `onPointerDownCapture` and `window` listeners both receive it with correct properties.
  - `document.elementFromPoint` does not exist — tests must stub it.
  - `isTrusted` is **non-configurable**: `Object.defineProperty(event, 'isTrusted', …)` throws
    `TypeError: Cannot redefine property: isTrusted`, even with `configurable: true`. A trusted
    event cannot be faked through the DOM, so the suppression predicate is tested by calling the
    handler directly with a plain object.
  - `getBoundingClientRect` returns zeros (no layout). Not needed by this feature.
  - `element.scrollLeft` / `scrollTop` **are** plain writable properties — assigning and reading
    back works, so the classic-scheme assertions are sound.
- **i18n in render tests:** `import i18n from '../../i18n';` at the top of the test file
  (pattern from `DrawingToolbar.smoke.test.jsx:3`). No provider wrapper needed.
- **Comment language:** English, matching `SceneViewport.jsx` / `SceneImage.jsx` / `DrawingLayer.jsx`.
  (`FogLayer.jsx` uses Polish; do not follow it — it is the outlier.)
- **`npm install` is already done** in this worktree. If you run it again, it rewrites
  `package-lock.json` with peer-dependency drift — `git checkout -- warhammer-battle-helper-front/package-lock.json`
  before committing.
- **Drag threshold:** `8` px. Named constant `RIGHT_PAN_THRESHOLD`.
- **Commit trailer:** every commit ends with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Commit subject prefix:** `<type>(front): FEATURE-142 <summary>` — repo convention.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/components/scene/useRightDragPan.js` | Whole right-button gesture: pan math, click-vs-drag, native-menu suppression, synthetic replay | **Create** |
| `src/components/scene/useRightDragPan.test.jsx` | Unit tests for the hook, driven through a harness component | **Create** |
| `src/components/scene/SceneImageContextMenu.jsx` | Single-image context menu | Modify (drop `contextmenu` listener) |
| `src/components/scene/SceneTokenMultiContextMenu.jsx` | Group context menu | Modify (drop `contextmenu` listener) |
| `src/components/scene/SceneContextMenu.dismiss.test.jsx` | Regression test: both menus survive a trailing `contextmenu`, still close on outside `mousedown` | **Create** |
| `src/components/scene/SceneViewport.jsx` | Scene viewport; wires the hook onto the viewport div | Modify (~4 lines) |

Task order is deliberate: Task 1 is the actual Windows fix and stands alone; Task 2 builds the
gesture in isolation; Task 3 wires them together. Each leaves the suite green.

---

### Task 1: Stop both context menus from listening for `contextmenu`

This is the change that fixes Windows. The menu's own outside-click listener sits on `document` in
the capture phase — above React's root container — so when Windows delivers its trailing trusted
`contextmenu` after `pointerup`, that listener runs **before** any suppression the viewport could
apply, sees a target outside the menu, and closes the menu that was just opened.

The listener is redundant: both components already listen for `mousedown` in the capture phase, and
a right press fires `mousedown` on every platform.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImageContextMenu.jsx:11-25`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneTokenMultiContextMenu.jsx:12-19`
- Test: `warhammer-battle-helper-front/src/components/scene/SceneContextMenu.dismiss.test.jsx` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks. Behavioural precondition for Task 3.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/scene/SceneContextMenu.dismiss.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import SceneImageContextMenu from './SceneImageContextMenu';
import SceneTokenMultiContextMenu from './SceneTokenMultiContextMenu';

// A right-button press produces `mousedown` on every platform, so that alone dismisses the menu.
// `contextmenu` must NOT dismiss it: on Windows the trusted contextmenu arrives AFTER pointerup,
// i.e. after the replayed click has already opened the menu, and dismissing on it closed the menu
// the user had just asked for (FEATURE-142).
const mouse = (type, init) => new MouseEvent(type, {
  bubbles: true, cancelable: true, view: window, ...init,
});

const imageMenuProps = {
  x: 10, y: 10,
  image: { id: 'img1', layer: 'tokens', zIndex: 0, locked: false },
  onZIndexChange: () => {}, onLayerChange: () => {}, onResizeToGrid: () => {},
  onResetRotation: () => {}, onLockToggle: () => {}, onDuplicate: () => {}, onDelete: () => {},
};

const multiMenuProps = {
  x: 10, y: 10,
  selection: [{ kind: 'image', id: 'a' }, { kind: 'image', id: 'b' }],
  onDelete: () => {}, onSetLock: () => {}, onSetLayer: () => {}, onResetRotation: () => {},
};

describe.each([
  ['SceneImageContextMenu', SceneImageContextMenu, imageMenuProps],
  ['SceneTokenMultiContextMenu', SceneTokenMultiContextMenu, multiMenuProps],
])('%s dismissal', (_name, Menu, props) => {
  it('does not close on an outside contextmenu', () => {
    const onClose = jest.fn();
    render(<Menu {...props} onClose={onClose} />);
    fireEvent(document.body, mouse('contextmenu', { button: 2, clientX: 500, clientY: 500 }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on an outside mousedown', () => {
    const onClose = jest.fn();
    render(<Menu {...props} onClose={onClose} />);
    fireEvent(document.body, mouse('mousedown', { button: 2, clientX: 500, clientY: 500 }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on a mousedown inside the menu', () => {
    const onClose = jest.fn();
    render(<Menu {...props} onClose={onClose} />);
    // The menu renders through a portal into document.body, not into render's `container`.
    const menu = document.body.querySelector('.scene-context-menu');
    expect(menu).not.toBeNull();
    fireEvent(menu, mouse('mousedown', { button: 0 }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `warhammer-battle-helper-front/`:

```bash
CI=true npm test -- --watchAll=false --testPathPattern=SceneContextMenu.dismiss
```

Expected: the two `does not close on an outside contextmenu` cases FAIL with
`Expected number of calls: 0 / Received number of calls: 1`. The other four pass.

If a case fails for any other reason (missing prop, render crash), fix the test — the props above
must match the components' current signatures.

- [ ] **Step 3: Remove the listener from `SceneImageContextMenu`**

In `SceneImageContextMenu.jsx`, replace the whole `useEffect` block (currently lines 11–25) with:

```jsx
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    // Capture phase: fires on document before any element's onMouseDown, so it works even over
    // images / drawing / fog layers whose handlers call stopPropagation (which would otherwise
    // keep a bubble-phase listener from ever seeing the click). mousedown alone covers the right
    // button too — every platform fires it on a right press.
    //
    // Deliberately NOT listening for `contextmenu`: on Windows the trusted contextmenu arrives
    // after pointerup, i.e. after useRightDragPan has already replayed the click that opened this
    // menu, and dismissing on it closed the menu the user had just asked for (FEATURE-142).
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [onClose]);
```

- [ ] **Step 4: Remove the listener from `SceneTokenMultiContextMenu`**

In `SceneTokenMultiContextMenu.jsx`, replace the `useEffect` block (currently lines 12–19) with:

```jsx
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    // mousedown only — see the note in SceneImageContextMenu: a `contextmenu` listener here closed
    // the menu on Windows, where the trusted event trails pointerup (FEATURE-142).
    document.addEventListener('mousedown', h, true);
    return () => {
      document.removeEventListener('mousedown', h, true);
    };
  }, [onClose]);
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=SceneContextMenu.dismiss
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Run the full suite**

```bash
CI=true npm test -- --watchAll=false
```

Expected: `Tests: 313 passed, 313 total`, `Test Suites: 1 failed, 47 passed, 48 total`
(the single failure is the pre-existing `App.test.js` axios error).

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneImageContextMenu.jsx \
        warhammer-battle-helper-front/src/components/scene/SceneTokenMultiContextMenu.jsx \
        warhammer-battle-helper-front/src/components/scene/SceneContextMenu.dismiss.test.jsx
git commit -m "$(cat <<'EOF'
fix(front): FEATURE-142 stop scene context menus dismissing on contextmenu

Both menus listened for `contextmenu` on document in the capture phase, on top
of the `mousedown` listener they already had. That is redundant — a right press
fires mousedown on every platform — and it is what broke the image menu on
Windows: the trusted contextmenu arrives there AFTER pointerup, so it landed
once the menu was already open, saw a target outside the menu, and closed it.

document sits above React's root container in the capture phase, so no
suppression the viewport installs can run before this listener. Removing it is
the only fix available at this level.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `useRightDragPan` hook

Builds the gesture in isolation, with no consumer yet. The suite stays green throughout.

**Files:**
- Create: `warhammer-battle-helper-front/src/components/scene/useRightDragPan.js`
- Test: `warhammer-battle-helper-front/src/components/scene/useRightDragPan.test.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```js
  export function useRightDragPan({
    viewportRef,    // React ref to the scrollable viewport element (classic scheme scrolls it)
    panOffsetRef,   // React ref mirroring panOffset, shape { x: number, y: number }
    schemeRef,      // React ref holding 'modern' | 'classic'
    setPanOffset,   // (offset: {x, y}) => void
    setIsPanning,   // (panning: boolean) => void
  }): {
    onPointerDownCapture: (e: React.PointerEvent) => void,
    onContextMenuCapture: (e: React.MouseEvent) => void,
  }
  ```
  Task 3 spreads both returned handlers onto the viewport div.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/components/scene/useRightDragPan.test.jsx`:

```jsx
import React, { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRightDragPan } from './useRightDragPan';

// jsdom has no PointerEvent constructor, and fireEvent.pointerDown drops `button`/`clientX`.
// A MouseEvent carrying the pointer type name delivers both correctly to React's
// onPointerDownCapture and to window listeners. Verified in this worktree.
const mouse = (type, init) => new MouseEvent(type, {
  bubbles: true, cancelable: true, view: window, ...init,
});

// Harness: exposes the hook's handlers on a div and records what the hook did to the caller's state.
function Harness({ scheme = 'modern', calls }) {
  const viewportRef = useRef(null);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const schemeRef = useRef(scheme);
  const { onPointerDownCapture, onContextMenuCapture } = useRightDragPan({
    viewportRef,
    panOffsetRef,
    schemeRef,
    setPanOffset: (o) => { calls.panOffsets.push(o); panOffsetRef.current = o; },
    setIsPanning: (v) => { calls.panning.push(v); },
  });
  return (
    <div ref={viewportRef} data-testid="viewport"
      onPointerDownCapture={onPointerDownCapture}
      onContextMenuCapture={onContextMenuCapture}>
      <div data-testid="child">child</div>
    </div>
  );
}

function setup(scheme = 'modern') {
  const calls = { panOffsets: [], panning: [] };
  render(<Harness scheme={scheme} calls={calls} />);
  const viewport = screen.getByTestId('viewport');
  // jsdom does not implement scrolling; plain writable properties stand in for it.
  viewport.scrollLeft = 0;
  viewport.scrollTop = 0;
  return { calls, viewport, child: screen.getByTestId('child') };
}

// jsdom has no document.elementFromPoint. Point it at a node and capture what gets dispatched.
function stubElementFromPoint(node) {
  const received = [];
  node.addEventListener('contextmenu', (e) => received.push(e));
  document.elementFromPoint = () => node;
  return received;
}

afterEach(() => {
  delete document.elementFromPoint;
});

describe('useRightDragPan — panning', () => {
  it('ignores a press that is not the right button', () => {
    const { calls, viewport } = setup();
    fireEvent(viewport, mouse('pointerdown', { button: 0, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 100, clientY: 100 }));
    expect(calls.panning).toEqual([]);
    expect(calls.panOffsets).toEqual([]);
  });

  it('does not pan before the movement threshold', () => {
    const { calls, viewport } = setup();
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    // 5,5 → hypot ≈ 7.07, below the 8px threshold.
    fireEvent(window, mouse('pointermove', { clientX: 5, clientY: 5 }));
    expect(calls.panning).toEqual([]);
    expect(calls.panOffsets).toEqual([]);
  });

  it('pans via panOffset past the threshold in the modern scheme', () => {
    const { calls, viewport } = setup('modern');
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 30, clientY: 20 }));
    expect(calls.panning).toEqual([true]);
    expect(calls.panOffsets).toEqual([{ x: 30, y: 20 }]);
  });

  it('pans via scroll past the threshold in the classic scheme', () => {
    const { calls, viewport } = setup('classic');
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 30, clientY: 20 }));
    expect(calls.panning).toEqual([true]);
    // Scrolling moves opposite the pointer: drag right → content scrolls left.
    expect(viewport.scrollLeft).toBe(-30);
    expect(viewport.scrollTop).toBe(-20);
    expect(calls.panOffsets).toEqual([]);
  });

  it('tracks the pointer across successive moves from the original press point', () => {
    const { calls, viewport } = setup('modern');
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 30, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 50, clientY: 0 }));
    expect(calls.panOffsets).toEqual([{ x: 30, y: 0 }, { x: 50, y: 0 }]);
  });

  it('stops panning on pointerup', () => {
    const { calls, viewport, child } = setup();
    stubElementFromPoint(child);
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 30, clientY: 20 }));
    fireEvent(window, mouse('pointerup', { button: 2, clientX: 30, clientY: 20 }));
    expect(calls.panning).toEqual([true, false]);
  });

  it('ignores moves after release', () => {
    const { calls, viewport, child } = setup();
    stubElementFromPoint(child);
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointerup', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 200, clientY: 200 }));
    expect(calls.panOffsets).toEqual([]);
  });

  it('ends the gesture on pointercancel without replaying a menu', () => {
    const { calls, viewport, child } = setup();
    const received = stubElementFromPoint(child);
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 30, clientY: 20 }));
    fireEvent(window, mouse('pointercancel', { clientX: 30, clientY: 20 }));
    expect(calls.panning).toEqual([true, false]);
    expect(received).toHaveLength(0);
  });
});

describe('useRightDragPan — context menu replay', () => {
  it('replays a contextmenu when the press never moved', () => {
    const { viewport, child } = setup();
    const received = stubElementFromPoint(child);
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 40, clientY: 50 }));
    fireEvent(window, mouse('pointerup', { button: 2, clientX: 40, clientY: 50 }));
    expect(received).toHaveLength(1);
    expect(received[0].isTrusted).toBe(false);
    expect(received[0].button).toBe(2);
    expect(received[0].clientX).toBe(40);
    expect(received[0].clientY).toBe(50);
    expect(received[0].bubbles).toBe(true);
  });

  it('replays after movement that stayed under the threshold', () => {
    const { viewport, child } = setup();
    const received = stubElementFromPoint(child);
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 3, clientY: 3 }));
    fireEvent(window, mouse('pointerup', { button: 2, clientX: 3, clientY: 3 }));
    expect(received).toHaveLength(1);
  });

  it('does not replay after a real drag', () => {
    const { viewport, child } = setup();
    const received = stubElementFromPoint(child);
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 30, clientY: 20 }));
    fireEvent(window, mouse('pointerup', { button: 2, clientX: 30, clientY: 20 }));
    expect(received).toHaveLength(0);
  });

  it('survives elementFromPoint finding nothing', () => {
    const { viewport } = setup();
    document.elementFromPoint = () => null;
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    expect(() => {
      fireEvent(window, mouse('pointerup', { button: 2, clientX: 0, clientY: 0 }));
    }).not.toThrow();
  });
});

// `isTrusted` is non-configurable in jsdom — Object.defineProperty on a dispatched event throws
// `TypeError: Cannot redefine property: isTrusted`, so a trusted event cannot be simulated through
// fireEvent. Verified in this worktree. The handler is a pure predicate over `isTrusted`, `button`,
// `preventDefault` and `stopPropagation`, so call it directly with a plain object instead. The one
// case fireEvent CAN cover for real — our untrusted replay — is exercised through the DOM below.
describe('useRightDragPan — native menu suppression', () => {
  function handlers(scheme = 'modern') {
    const captured = {};
    function Probe() {
      const viewportRef = useRef(null);
      const panOffsetRef = useRef({ x: 0, y: 0 });
      const schemeRef = useRef(scheme);
      Object.assign(captured, useRightDragPan({
        viewportRef, panOffsetRef, schemeRef, setPanOffset: () => {}, setIsPanning: () => {},
      }));
      return <div ref={viewportRef} />;
    }
    render(<Probe />);
    return captured;
  }

  const fakeEvent = (isTrusted, button) => ({
    isTrusted, button, preventDefault: jest.fn(), stopPropagation: jest.fn(),
  });

  it('suppresses a trusted right-button contextmenu', () => {
    const e = fakeEvent(true, 2);
    handlers().onContextMenuCapture(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('lets a trusted button-0 contextmenu through (macOS Ctrl+click, Menu key)', () => {
    const e = fakeEvent(true, 0);
    handlers().onContextMenuCapture(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it('lets our own replayed (untrusted) contextmenu through', () => {
    const e = fakeEvent(false, 2);
    handlers().onContextMenuCapture(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('does not suppress a replayed contextmenu travelling through the real DOM', () => {
    const { viewport } = setup();
    const e = mouse('contextmenu', { button: 2, clientX: 0, clientY: 0 });
    expect(e.isTrusted).toBe(false); // anything dispatched from script is untrusted
    fireEvent(viewport, e);
    expect(e.defaultPrevented).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=useRightDragPan
```

Expected: the whole suite fails to run —
`Cannot find module './useRightDragPan' from 'src/components/scene/useRightDragPan.test.jsx'`.

- [ ] **Step 3: Write the hook**

Create `warhammer-battle-helper-front/src/components/scene/useRightDragPan.js`:

```js
import { useRef, useEffect, useCallback } from 'react';

// px of movement before a right-press counts as a pan rather than a menu click. Higher than the 5px
// the pre-FEATURE-142 code used: a right-click closes a fog polygon and abandons a drawing stroke,
// so a shaky hand must not silently pan the map instead of triggering the tool action.
const RIGHT_PAN_THRESHOLD = 8;

/**
 * Right-button drag-to-pan for the scene map, on every layer and in both control schemes.
 *
 * Pointer Events, not mouse events: Chrome on macOS never fires `mouseup` for the secondary button,
 * only `pointerup`.
 *
 * The hard part is not the panning, it is telling a pan from a right-click without breaking the
 * context menu — the browser fires `contextmenu` at a different point in the gesture on each OS
 * (macOS on pointerdown, Windows after pointerup). So we never let the native event decide anything:
 * every trusted right-button `contextmenu` is suppressed, and on release we *replay* a synthetic one
 * when the press turned out to be a click. Menu opening is then driven purely by `pointerup`, whose
 * ordering is identical everywhere.
 *
 * The suppression predicate reads only the event's own properties — no flag written by a different
 * event, no timer — so there is nothing for the OS's event ordering to race against. That is the
 * bug that sank the previous implementation (548d6ca / 3267a75); see the FEATURE-142 design doc.
 *
 * `button === 2` is what separates a physical right press from macOS's Ctrl+click emulation and the
 * Menu key, which both report button 0 with no matching pointerdown. Those keep the native menu.
 */
export function useRightDragPan({ viewportRef, panOffsetRef, schemeRef, setPanOffset, setIsPanning }) {
  // Drag origin: pointer position plus both scroll models' starting values, so a move can be
  // resolved against whichever scheme is active without re-reading the DOM.
  const startRef = useRef(null);
  const didPanRef = useRef(false);

  const onPointerDownCapture = useCallback((e) => {
    if (e.button !== 2) return;
    startRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: panOffsetRef.current.x,
      startY: panOffsetRef.current.y,
      scrollLeft: viewportRef.current?.scrollLeft || 0,
      scrollTop: viewportRef.current?.scrollTop || 0,
    };
    didPanRef.current = false;
  }, [panOffsetRef, viewportRef]);

  const onContextMenuCapture = useCallback((e) => {
    // Our own replay is untrusted and must reach SceneImage / the group menu / the fog and drawing
    // layers untouched.
    if (e.isTrusted && e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  useEffect(() => {
    const handleMove = (e) => {
      const start = startRef.current;
      if (!start) return;
      const dx = e.clientX - start.mouseX;
      const dy = e.clientY - start.mouseY;
      if (!didPanRef.current) {
        if (Math.hypot(dx, dy) <= RIGHT_PAN_THRESHOLD) return;
        didPanRef.current = true;
        setIsPanning(true);
      }
      if (schemeRef.current === 'classic') {
        const el = viewportRef.current;
        if (el) {
          el.scrollLeft = start.scrollLeft - dx;
          el.scrollTop = start.scrollTop - dy;
        }
      } else {
        const offset = { x: start.startX + dx, y: start.startY + dy };
        setPanOffset(offset);
        panOffsetRef.current = offset;
      }
    };

    const end = (e, replay) => {
      if (!startRef.current) return;
      const wasDrag = didPanRef.current;
      startRef.current = null;
      didPanRef.current = false;
      if (wasDrag) setIsPanning(false);
      if (replay && !wasDrag) {
        // Synchronous — no setTimeout. The old code deferred this and raced the browser's own
        // contextmenu; there is nothing left to wait for now that suppression is unconditional.
        document.elementFromPoint(e.clientX, e.clientY)?.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, view: window,
          clientX: e.clientX, clientY: e.clientY, button: 2,
        }));
      }
    };

    const handleUp = (e) => end(e, true);
    // A cancelled gesture (OS gesture, window focus loss) is neither a pan nor a click: clean up the
    // grabbing cursor, but do not open a menu the user never asked for.
    const handleCancel = (e) => end(e, false);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [panOffsetRef, schemeRef, setIsPanning, setPanOffset, viewportRef]);

  return { onPointerDownCapture, onContextMenuCapture };
}
```

Two details the tests pin down:

- `setIsPanning(false)` runs only when a drag actually started (`wasDrag`). A plain click must not
  emit a `false` the caller never saw a `true` for — the `stops panning on pointerup` and
  `ends the gesture on pointercancel` tests both assert the exact sequence `[true, false]`.
- The threshold uses `<=`, so a move of exactly 8px does not pan. `hypot(5,5) ≈ 7.07` stays below;
  `hypot(30,20) ≈ 36` clears it.

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=useRightDragPan
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Run the full suite**

```bash
CI=true npm test -- --watchAll=false
```

Expected: `Tests: 329 passed, 329 total`, one pre-existing `App.test.js` suite failure.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/useRightDragPan.js \
        warhammer-battle-helper-front/src/components/scene/useRightDragPan.test.jsx
git commit -m "$(cat <<'EOF'
feat(front): FEATURE-142 add useRightDragPan hook

Right-button drag-to-pan for the scene map, extracted into its own hook rather
than added back to the 976-line SceneViewport. Not wired up yet.

Pointer events, because Chrome on macOS never fires mouseup for the secondary
button. Panning follows the active control scheme: scrollLeft/scrollTop in
classic, panOffset in modern.

Telling a pan from a right-click is the part that broke before. The browser
fires contextmenu at a different point in the gesture per OS, so the hook never
lets that event decide: every trusted right-button contextmenu is suppressed and
a synthetic one is replayed on release when the press did not move. The
suppression predicate reads only the event's own properties -- no cross-event
flag, no timer -- so there is no ordering to race. Ctrl+click on macOS and the
Menu key report button 0 and keep the native menu.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire the hook into `SceneViewport`

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx`
  (import near line 13; hook call after the `schemeRef` effect, ~line 292; JSX props ~line 552)

**Interfaces:**
- Consumes: `useRightDragPan` from Task 2 — exact signature in that task's Interfaces block.
- Produces: nothing.

- [ ] **Step 1: Import the hook**

In `SceneViewport.jsx`, after the existing `useDrawingTextInput` import (line 13), add:

```jsx
import { useRightDragPan } from './useRightDragPan';
```

- [ ] **Step 2: Call the hook**

`schemeRef` is declared in the effect block ending around line 292 (`}, [controlScheme]);`).
Insert immediately after that effect, before `const handleViewportMouseDown = useCallback(`:

```jsx
  // Right-button drag pans the map on every layer and in both schemes; a right-CLICK still reaches
  // the layer's own menu (image, group, fog polygon, drawing stroke). See useRightDragPan for why
  // the native contextmenu is suppressed and replayed.
  const rightDragPan = useRightDragPan({
    viewportRef, panOffsetRef, schemeRef, setPanOffset, setIsPanning,
  });
```

All five arguments already exist in this scope: `viewportRef` (line 74), `panOffsetRef` (line 77),
`schemeRef` (line 289), and the `setPanOffset` / `setIsPanning` setters (lines 61–62). Do not
create new ones.

- [ ] **Step 3: Attach the handlers to the viewport div**

Find the viewport div (around line 550):

```jsx
        <div
          ref={viewportRef}
          onMouseDownCapture={handleViewportMouseDown}
          className={`scene-viewport${...}`}
        >
```

Add the two handlers, leaving the existing `ref`, `onMouseDownCapture` and `className` untouched:

```jsx
        <div
          ref={viewportRef}
          onMouseDownCapture={handleViewportMouseDown}
          onPointerDownCapture={rightDragPan.onPointerDownCapture}
          onContextMenuCapture={rightDragPan.onContextMenuCapture}
          className={`scene-viewport${...}`}
        >
```

- [ ] **Step 4: Update the stale comment in `handleViewportMouseDown`**

Line 268 currently reads:

```jsx
    // Right button no longer pans; it opens the native context menu on scene images.
```

Replace with:

```jsx
    // Right-button pan lives in useRightDragPan (pointer events — Chrome on macOS never fires
    // mouseup for the secondary button), so this handler only ever deals with the left button.
```

- [ ] **Step 5: Run the full suite**

```bash
CI=true npm test -- --watchAll=false
```

Expected: `Tests: 329 passed, 329 total`, one pre-existing `App.test.js` suite failure.
No new failures — `SceneViewport` has no render tests, so this run is a regression check on
everything else.

- [ ] **Step 6: Check for lint warnings**

```bash
CI=true npm run build 2>&1 | tail -30
```

Expected: `Compiled successfully.` CRA treats warnings as errors when `CI=true`, so an unused
variable or a bad hook dependency array fails here. Fix anything it reports before committing.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx
git commit -m "$(cat <<'EOF'
feat(front): FEATURE-142 restore right-button drag-to-pan

Wires useRightDragPan onto the scene viewport, re-enabling the gesture disabled
in 548d6ca. Right-drag pans on every layer and in both control schemes; a plain
right-click still opens whatever menu the current layer owns.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Manual cross-platform verification

Automated tests run in jsdom, which has no real event ordering and no PointerEvent — precisely the
things this feature is about. **The design rests on one unverified assumption: that a `contextmenu`
raised by a physical right-button press reports `button === 2` in every target browser.** Nothing in
the test suite can confirm that. This task is not optional.

**Files:** none — verification only.

**Interfaces:**
- Consumes: the wired-up viewport from Task 3.
- Produces: a go/no-go on the design's core assumption.

- [ ] **Step 1: Start the worktree frontend**

The docker frontend container bind-mounts the **main checkout**, so `localhost:3000` serves `main`
regardless of this branch. A second dev server on a spare port also fails: the backend CORS
whitelist is hardcoded to `localhost:3000` / `:3001` and `:3001` is taken by the admin container.
Swap only the frontend layer:

```bash
docker stop warhammer-battle-helper-frontend-1
docker compose -f /Users/mateuszprocner/priv/warhammer-battle-helper/.claude/worktrees/FEATURE-142/docker-compose.yml -p wbh142 up -d frontend
```

Then open `http://localhost:3000`, log in as GM, open a scene with at least two images on the
tokens layer.

- [ ] **Step 2: Confirm the `button === 2` assumption before anything else**

In the browser console:

```js
window.addEventListener('contextmenu', e =>
  console.log('trusted:', e.isTrusted, 'button:', e.button), true);
```

Right-click the map with a physical right press. **Expected: `trusted: true  button: 2`.**

If it logs `button: 0`, STOP — the whole suppression predicate is invalid on this browser. Fall back
to the design doc's Plan B (suppress every trusted contextmenu; route macOS Ctrl+click through the
replay path by widening the pointerdown guard to `button === 0 && e.ctrlKey`), and update the spec.

On macOS also check Ctrl+click: expected `trusted: true  button: 0`.

- [ ] **Step 3: Walk the checklist on macOS**

1. Right-drag on empty map → scene follows the cursor; no menu on release.
2. Right-click an image → image menu opens **and stays open**.
3. Right-click away from an open menu → menu closes.
4. Right-click a second image while the first menu is open → menu moves to the new image.
5. Select mode, 2+ tokens selected → right-click gives the group menu; right-drag pans.
6. Fog mode, polygon in progress → right-click closes the polygon; right-drag pans.
7. Drawing mode, stroke in progress → right-click abandons the stroke; right-drag pans.
8. Classic scheme (settings) → right-drag pans via scrolling.
9. Ctrl+click an image → image menu opens.
10. Middle-click → still cycles scene modes.

- [ ] **Step 4: Repeat steps 2 and 3 on Windows**

Non-negotiable — this is the platform the feature broke on, and case 2 is the exact regression.
Watch for a menu that flashes and vanishes: that is the old bug returning, and it means the
`contextmenu` listener removal in Task 1 was incomplete or something else on `document` is closing
the menu.

- [ ] **Step 5: Restore the docker stack**

```bash
docker compose -p wbh142 down
docker start warhammer-battle-helper-frontend-1
```

- [ ] **Step 6: Record the result**

Append a short "Weryfikacja" section to the spec
(`docs/superpowers/specs/2026-08-28-FEATURE-142-right-drag-pan-design.md`) recording, per platform:
browser and version, the observed `isTrusted`/`button` values from Step 2, and which checklist cases
passed. Commit:

```bash
git add docs/superpowers/specs/2026-08-28-FEATURE-142-right-drag-pan-design.md
git commit -m "$(cat <<'EOF'
docs(front): FEATURE-142 record cross-platform verification results

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| Rozwiązanie 1 — menu przestaje nasłuchiwać `contextmenu` | Task 1 |
| Rozwiązanie 2 — bezstanowy warunek dławienia | Task 2, Step 3 (`onContextMenuCapture`) |
| Rozwiązanie 3 — hook `useRightDragPan`, pan + replay + `pointercancel` | Task 2 |
| Próg draga 8px | Task 2, `RIGHT_PAN_THRESHOLD` |
| Podpięcie w viewportcie, oba schematy, każda warstwa | Task 3 |
| Konsumenci menu bez zmian | Guaranteed by Tasks 1 and 3 touching no consumer |
| Testy (10 przypadków ze specyfikacji) | Task 2, 16 cases (superset) |
| Weryfikacja ręczna (10 przypadków) | Task 4, Step 3 |
| Ryzyko: `button === 2` | Task 4, Step 2 — gated, with Plan B |
| Znane ograniczenie: Ctrl+klik przy otwartym menu | Out of scope by design; unchanged behaviour |
