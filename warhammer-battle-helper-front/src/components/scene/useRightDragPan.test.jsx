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
function Harness({ scheme = 'modern', calls, onChildContextMenu }) {
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
      <div data-testid="child" onContextMenu={onChildContextMenu}>child</div>
      {/* The drawing text tool renders a real input inside this subtree (SceneViewport.jsx). */}
      <input data-testid="text-input" type="text" />
    </div>
  );
}

function setup(scheme = 'modern', onChildContextMenu) {
  const calls = { panOffsets: [], panning: [] };
  render(<Harness scheme={scheme} calls={calls} onChildContextMenu={onChildContextMenu} />);
  const viewport = screen.getByTestId('viewport');
  // jsdom does not implement scrolling; plain writable properties stand in for it.
  viewport.scrollLeft = 0;
  viewport.scrollTop = 0;
  return { calls, viewport, child: screen.getByTestId('child'), textInput: screen.getByTestId('text-input') };
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

  it('does not pan at exactly the movement threshold (<=, not <)', () => {
    const { calls, viewport } = setup();
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointermove', { clientX: 8, clientY: 0 }));
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

describe('useRightDragPan — editable targets keep their own menu', () => {
  it('does not begin a pan for a right press starting on an input', () => {
    const { calls, textInput } = setup();
    fireEvent(textInput, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    // Well past the 8px threshold — would pan if the input were not excluded.
    fireEvent(window, mouse('pointermove', { clientX: 100, clientY: 100 }));
    expect(calls.panning).toEqual([]);
    expect(calls.panOffsets).toEqual([]);
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

  it('reaches a React onContextMenu handler, not just native listeners', () => {
    // The other tests here only prove the replay travels the DOM — they attach a native listener
    // via addEventListener. React's synthetic event system is a separate delivery path (it listens
    // on the root container and does its own dispatch), and that is what SceneImage / the group
    // menu / FogLayer / DrawingLayer actually use, so it must be proven separately.
    const onChildContextMenu = jest.fn();
    const { viewport, child } = setup('modern', onChildContextMenu);
    document.elementFromPoint = () => child;
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointerup', { button: 2, clientX: 0, clientY: 0 }));
    expect(onChildContextMenu).toHaveBeenCalledTimes(1);
  });

  it('does not flash the grab cursor on a plain click (no setIsPanning(false) with no preceding true)', () => {
    const { calls, viewport, child } = setup();
    stubElementFromPoint(child);
    fireEvent(viewport, mouse('pointerdown', { button: 2, clientX: 0, clientY: 0 }));
    fireEvent(window, mouse('pointerup', { button: 2, clientX: 0, clientY: 0 }));
    expect(calls.panning).toEqual([]);
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

  // `buttons` defaults to 2 — the bitmask a standalone right press carries, measured in a real
  // browser. It is the discriminator for the multi-button cases below, so it is a real parameter.
  const fakeEvent = (isTrusted, button, buttons = 2) => ({
    isTrusted, button, buttons, preventDefault: jest.fn(), stopPropagation: jest.fn(),
  });

  it('suppresses a trusted right-button contextmenu', () => {
    const e = fakeEvent(true, 2);
    handlers().onContextMenuCapture(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('suppresses a trusted contextmenu that trails the release (Windows ordering)', () => {
    // On Windows the trusted event arrives after pointerup, with every button already back up.
    const e = fakeEvent(true, 2, 0);
    handlers().onContextMenuCapture(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('does NOT suppress a right-click made while the left button is held', () => {
    // Measured in a real browser: a mouse is ONE pointer, so pressing the right button while the
    // left is down fires `pointermove` (buttons 1→3), never `pointerdown`. No gesture is recorded
    // and no replay can follow, so suppressing here would silently swallow the event — which is
    // exactly what broke right-click-to-abandon in DrawingLayer and FogLayer's freehand/rect tools.
    const e = fakeEvent(true, 2, 3);
    handlers().onContextMenuCapture(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it('does NOT suppress a right-click made while the middle button is held', () => {
    const e = fakeEvent(true, 2, 6); // middle (4) + right (2)
    handlers().onContextMenuCapture(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
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

  it('does not suppress a trusted contextmenu whose target is an input', () => {
    const input = document.createElement('input');
    const e = { isTrusted: true, button: 2, target: input, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    handlers().onContextMenuCapture(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it('does not suppress a replayed contextmenu travelling through the real DOM', () => {
    const { viewport } = setup();
    const e = mouse('contextmenu', { button: 2, clientX: 0, clientY: 0 });
    expect(e.isTrusted).toBe(false); // anything dispatched from script is untrusted
    fireEvent(viewport, e);
    expect(e.defaultPrevented).toBe(false);
  });
});
