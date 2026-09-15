import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import FogLayer from './FogLayer';

/**
 * jsdom has no 2D canvas — `getContext('2d')` returns null. We substitute an object that
 * pretends to be a context and snapshots its state on every painting call. That lets a test
 * check NOT just what was drawn, but in which composite mode and in which colour — which is
 * exactly what BUG-202 is about.
 */
const recordingContext = () => {
  const calls = [];
  // Path cursor movements, in call order. Separate from `calls` because these carry
  // coordinates rather than paint state — they are how a test checks WHERE a line went.
  // The composite mode rides along and is load-bearing: `render()` traces the polygon's
  // reveal FILL through the same moveTo/lineTo calls as the GM's guide overlay, and only
  // the mode tells them apart — the fill runs under `destination-out` before the fade, the
  // overlay under `source-over` after it.
  const path = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    setLineDash: () => {},
    clearRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: (x, y) => path.push({ op: 'moveTo', x, y, composite: ctx.globalCompositeOperation }),
    lineTo: (x, y) => path.push({ op: 'lineTo', x, y, composite: ctx.globalCompositeOperation }),
    arc: () => {},
    rect: () => {},
  };
  const snap = (op) => calls.push({
    op,
    composite: ctx.globalCompositeOperation,
    fillStyle: ctx.fillStyle,
    strokeStyle: ctx.strokeStyle,
    lineWidth: ctx.lineWidth,
  });
  ctx.fill = () => snap('fill');
  ctx.fillRect = () => snap('fillRect');
  ctx.stroke = () => snap('stroke');
  return { ctx, calls, path };
};

const CANVAS_W = 400;
const CANVAS_H = 300;

const baseProps = {
  scene: { fogEnabled: true, revealPaths: [] },
  isGM: true,
  editingLayer: 'fog',
  canvasWidth: CANVAS_W,
  canvasHeight: CANVAS_H,
  brushSize: 30,
  onPathComplete: () => {},
};

let recording;

beforeEach(() => {
  recording = recordingContext();
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recording.ctx);
  // getBoundingClientRect returns all zeros in jsdom — without a stub getSceneCoords divides
  // by zero and every coordinate comes out Infinity.
  jest.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: CANVAS_W, height: CANVAS_H,
    right: CANVAS_W, bottom: CANVAS_H, x: 0, y: 0, toJSON: () => {},
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// The mount-time paint (triggered by FogLayer's own layout effect) and a later
// interaction-triggered repaint both leave a fade entry in the shared `calls` log, so we
// want the LAST fade — the one immediately preceding whatever the test just triggered —
// not the first one recorded since the component mounted.
// `fillRect` narrows this to the canvas-wide fade specifically: the opaque fog fill and the
// fade are the only two `fillRect` calls `render()` ever makes, so the composite mode alone
// tells them apart — every reveal/cover shape (including a saved rect) traces a path and
// calls `fill()`, not `fillRect`, so this stays unique even with saved rect reveals present.
const fadeIndex = (calls) => {
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i].op === 'fillRect' && calls[i].composite === 'destination-out') return i;
  }
  return -1;
};

describe('BUG-202 — GM opacity is baked into the pixels, not applied to the whole canvas', () => {
  it('does not set CSS opacity on the canvas any more', () => {
    const { container } = render(<FogLayer {...baseProps} fogGmOpacity={0.5} />);
    expect(container.querySelector('canvas').style.opacity).toBe('');
  });

  it('fades the fog with a full-canvas destination-out pass matching the slider', () => {
    render(<FogLayer {...baseProps} fogGmOpacity={0.5} />);
    const fade = recording.calls[fadeIndex(recording.calls)];
    expect(fade).toBeDefined();
    expect(fade.fillStyle).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('skips the fade entirely for a player, whatever the slider says — untouched pixels', () => {
    render(<FogLayer {...baseProps} isGM={false} fogGmOpacity={0.2} />);
    expect(fadeIndex(recording.calls)).toBe(-1);
  });

  it('skips the fade for the GM at fogGmOpacity 1 — the < 1 boundary, not <= 1', () => {
    render(<FogLayer {...baseProps} fogGmOpacity={1} />);
    expect(fadeIndex(recording.calls)).toBe(-1);
  });

  it('draws the brush ring at its literal colour after the fade, whatever the slider says', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="freehand" fogGmOpacity={0.2} />,
    );
    const canvas = container.querySelector('canvas');
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 80 });

    const idx = fadeIndex(recording.calls);
    expect(idx).toBeGreaterThanOrEqual(0);
    const after = recording.calls.slice(idx + 1);

    expect(after.every((c) => c.composite === 'source-over')).toBe(true);
    expect(after.some((c) => c.op === 'stroke' && c.strokeStyle === 'rgba(255, 255, 255, 0.9)'))
      .toBe(true);
  });
});

describe('BUG-202 — the line tool shows the brush ring, because its width is brushSize', () => {
  it('hides the native cursor for the line tool, like for freehand', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="line" fogGmOpacity={0.5} />,
    );
    expect(container.querySelector('canvas').style.cursor).toBe('none');
  });

  it('keeps the crosshair for rect, which ignores brushSize', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="rect" fogGmOpacity={0.5} />,
    );
    expect(container.querySelector('canvas').style.cursor).toBe('crosshair');
  });

  it('draws the ring on an idle mouse move with the line tool selected', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="line" fogGmOpacity={0.5} />,
    );
    fireEvent.mouseMove(container.querySelector('canvas'), { clientX: 120, clientY: 90 });

    expect(recording.calls.some(
      (c) => c.op === 'stroke' && c.strokeStyle === 'rgba(255, 255, 255, 0.9)',
    )).toBe(true);
  });
});

describe('task-6 — the line tool cursor is a rotating square, not a circle', () => {
  it('draws a square marker (moveTo/lineTo trace) instead of the round arc() cursor', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="line" fogGmOpacity={0.5} />,
    );
    fireEvent.mouseMove(container.querySelector('canvas'), { clientX: 120, clientY: 90 });

    // arc() is a stubbed no-op that leaves no trace in `path` — only moveTo/lineTo do, so a
    // non-empty path here proves the marker is a polygon (square), not a circle.
    expect(recording.path.length).toBeGreaterThan(0);
    expect(recording.path.every((p) => p.composite === 'source-over')).toBe(true);
  });

  it('leaves the freehand cursor alone — still a circle, no square trace', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="freehand" fogGmOpacity={0.5} />,
    );
    fireEvent.mouseMove(container.querySelector('canvas'), { clientX: 120, clientY: 90 });

    expect(recording.path.length).toBe(0);
  });

  it('rotates the square to match the line while dragging along a diagonal', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="line" fogGmOpacity={0.5} />,
    );
    const canvas = container.querySelector('canvas');
    fireEvent.mouseDown(canvas, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });

    // At 45°, a square of half-side `radius` centred on the cursor lands its four corners at
    // exactly (cx ± radius·√2, cy) and (cx, cy ± radius·√2) — a closed form worked out by
    // hand, independent of the moveTo/lineTo code under test. The much bigger drag-outline
    // rectangle (built from the full 50,50→150,150 segment, also on-screen during this drag)
    // shares the same 45° angle but not these coordinates, so this catches a cursor that
    // silently fell back to leaving only the outline's trace behind.
    const cx = 150;
    const cy = 150;
    const radius = baseProps.brushSize / 2;
    const offset = radius * Math.SQRT2;

    const corners = recording.path.slice(-4).map((p) => [p.x, p.y]);
    expect(corners[0][0]).toBeCloseTo(cx - offset);
    expect(corners[0][1]).toBeCloseTo(cy);
    expect(corners[1][0]).toBeCloseTo(cx);
    expect(corners[1][1]).toBeCloseTo(cy + offset);
    expect(corners[2][0]).toBeCloseTo(cx + offset);
    expect(corners[2][1]).toBeCloseTo(cy);
    expect(corners[3][0]).toBeCloseTo(cx);
    expect(corners[3][1]).toBeCloseTo(cy - offset);
  });
});

const OVERLAY = 'rgba(255, 220, 100, 0.9)';

/** A drag: press at (x1,y1), move to (x2,y2). No mouseUp — the preview is what we are after. */
const drag = (canvas, [x1, y1], [x2, y2]) => {
  fireEvent.mouseDown(canvas, { button: 0, clientX: x1, clientY: y1 });
  fireEvent.mouseMove(canvas, { clientX: x2, clientY: y2 });
};

describe('BUG-202 — rect, circle and line get a preview outline like the polygon has', () => {
  it.each(['rect', 'circle', 'line'])('draws an outline while dragging with %s', (fogTool) => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool={fogTool} fogGmOpacity={0.5} />,
    );
    const canvas = container.querySelector('canvas');
    drag(canvas, [40, 40], [160, 120]);

    expect(recording.calls.some(
      (c) => c.op === 'stroke' && c.strokeStyle === OVERLAY && c.lineWidth === 2,
    )).toBe(true);
  });

  it('draws the outline after the fade, so the slider cannot dim it', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="rect" fogGmOpacity={0.2} />,
    );
    drag(container.querySelector('canvas'), [40, 40], [160, 120]);

    const idx = fadeIndex(recording.calls);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(recording.calls.slice(idx + 1).some(
      (c) => c.op === 'stroke' && c.strokeStyle === OVERLAY,
    )).toBe(true);
  });

  it('leaves freehand without an outline — its ring already shows the width', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="freehand" fogGmOpacity={0.5} />,
    );
    drag(container.querySelector('canvas'), [40, 40], [160, 120]);

    expect(recording.calls.some((c) => c.op === 'stroke' && c.strokeStyle === OVERLAY))
      .toBe(false);
  });
});

/**
 * The overlay chain from the most recent render: `source-over` entries only, so the polygon's
 * own reveal fill — same moveTo/lineTo shape, but `destination-out` and drawn before the fade —
 * cannot be mistaken for it. The chain is redrawn every render, so scan from the end.
 */
const lastOverlayChainFrom = (path, [sx, sy]) => {
  const overlay = path
    .filter((p) => p.composite === 'source-over')
    .map(({ op, x, y }) => [op, x, y]);
  for (let i = overlay.length - 1; i >= 0; i--) {
    const [op, x, y] = overlay[i];
    if (op === 'moveTo' && x === sx && y === sy) return overlay.slice(i);
  }
  return [];
};

describe('BUG-202 — the polygon shows the edges it has already placed', () => {
  it('runs one solid chain through every placed vertex and on to the cursor', () => {
    const { container } = render(
      <FogLayer {...baseProps} fogTool="polygon" fogGmOpacity={0.5} />,
    );
    const canvas = container.querySelector('canvas');

    // The harness stubs the canvas 1:1 against its bounding rect, so client coords are
    // scene coords. Vertices kept far from the first one, or the third click would snap shut.
    fireEvent.mouseDown(canvas, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 10 });
    fireEvent.mouseDown(canvas, { button: 0, clientX: 100, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 100 });
    fireEvent.mouseDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(canvas, { clientX: 40, clientY: 120 });

    expect(lastOverlayChainFrom(recording.path, [10, 10]).slice(0, 4)).toEqual([
      ['moveTo', 10, 10],
      ['lineTo', 100, 10],
      ['lineTo', 100, 100],
      ['lineTo', 40, 120],
    ]);
  });
});
