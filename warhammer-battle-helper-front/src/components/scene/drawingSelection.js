// Geometry of the drawing layer's select tool (PLAYRPG-254): what a click or a marquee hits, the
// bounds of a group, and how far a group may move. Pure functions in scene px — DrawingLayer only
// wires them to the mouse.
//
// A shape is hit by its stroke, never by its inside: a click in the middle of a big rectangle, or
// a marquee drawn entirely inside it, does not pick it. Labels are the exception — their whole box
// counts, the same box the click hit-test uses.
import { hitTestText, textBoxCorners, toTextLocal, measureTextBox } from './drawingText';

// Point-to-segment distance helper
function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Hit-test a path at scene point (px, py)
export function hitTestPath(path, px, py, tolerance = 10) {
  if (!path || !path.points || path.points.length === 0) return false;

  switch (path.tool) {
    case 'freehand': {
      if (path.points.length < 2) return false;
      for (let i = 1; i < path.points.length; i++) {
        if (distPointToSegment(px, py, path.points[i - 1][0], path.points[i - 1][1], path.points[i][0], path.points[i][1]) <= tolerance) return true;
      }
      return false;
    }
    case 'line':
    case 'arrow': {
      if (path.points.length < 2) return false;
      return distPointToSegment(px, py, path.points[0][0], path.points[0][1], path.points[1][0], path.points[1][1]) <= tolerance;
    }
    case 'rect': {
      if (path.points.length < 2) return false;
      const x1 = Math.min(path.points[0][0], path.points[1][0]);
      const y1 = Math.min(path.points[0][1], path.points[1][1]);
      const x2 = Math.max(path.points[0][0], path.points[1][0]);
      const y2 = Math.max(path.points[0][1], path.points[1][1]);
      return (
        (Math.abs(px - x1) <= tolerance && py >= y1 && py <= y2) ||
        (Math.abs(px - x2) <= tolerance && py >= y1 && py <= y2) ||
        (Math.abs(py - y1) <= tolerance && px >= x1 && px <= x2) ||
        (Math.abs(py - y2) <= tolerance && px >= x1 && px <= x2)
      );
    }
    case 'circle': {
      if (path.points.length < 2) return false;
      const [cx, cy] = path.points[0];
      const [ex, ey] = path.points[1];
      const radius = Math.hypot(ex - cx, ey - cy);
      return Math.abs(Math.hypot(px - cx, py - cy) - radius) <= tolerance;
    }
    case 'text':
      return hitTestText(path, px, py);
    default:
      return false;
  }
}

// Topmost path under (px, py) that the caller is allowed to delete.
// Paths the predicate rejects are skipped, not treated as blockers — a player
// right-clicking through the GM's line still reaches their own drawing beneath it.
export function findDeletablePathAt(paths, px, py, canDelete) {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    if (!canDelete(path)) continue;
    if (hitTestPath(path, px, py)) return path.id;
  }
  return null;
}

// Topmost text label under (px, py) that the caller may edit — same skip rule as deletion.
export function findEditableTextAt(paths, px, py, canEdit) {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    if (path.tool !== 'text' || !canEdit(path)) continue;
    if (hitTestPath(path, px, py)) return path;
  }
  return null;
}

// ── Marquee ──

// {x, y, width, height} with any sign of width/height → min/max corners, grown by `pad`.
function normalizeRect(rect, pad = 0) {
  const x1 = Math.min(rect.x, rect.x + rect.width) - pad;
  const y1 = Math.min(rect.y, rect.y + rect.height) - pad;
  const x2 = Math.max(rect.x, rect.x + rect.width) + pad;
  const y2 = Math.max(rect.y, rect.y + rect.height) + pad;
  return { x1, y1, x2, y2 };
}

const pointInRect = ([px, py], r) => px >= r.x1 && px <= r.x2 && py >= r.y1 && py <= r.y2;

// Liang–Barsky: does the segment a→b have any part inside the rectangle?
function segmentTouchesRect([ax, ay], [bx, by], r) {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const edges = [[-dx, ax - r.x1], [dx, r.x2 - ax], [-dy, ay - r.y1], [dy, r.y2 - ay]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false; // parallel to this edge and outside it
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function polylineTouchesRect(points, r) {
  if (points.length === 1) return pointInRect(points[0], r);
  for (let i = 1; i < points.length; i++) {
    if (segmentTouchesRect(points[i - 1], points[i], r)) return true;
  }
  return false;
}

function labelTouchesRect(path, r) {
  if (!path.text) return false;
  const corners = textBoxCorners(path);
  if (corners.some(c => pointInRect(c, r))) return true;
  // The marquee may sit wholly inside a big label: test one marquee corner in the label's frame.
  const { width, height } = measureTextBox(path);
  const [lx, ly] = toTextLocal(path, r.x1, r.y1);
  if (lx >= 0 && lx <= width && ly >= 0 && ly <= height) return true;
  return corners.some((c, i) => segmentTouchesRect(c, corners[(i + 1) % 4], r));
}

// Does the marquee touch the path's stroke? `tolerance` grows the marquee, like the click
// hit-test's tolerance grows the stroke.
export function pathTouchesRect(path, rect, tolerance = 10) {
  if (!path?.points?.length) return false;
  const r = normalizeRect(rect, tolerance);
  const pts = path.points;

  switch (path.tool) {
    case 'freehand':
      return polylineTouchesRect(pts, r);
    case 'line':
    case 'arrow':
      return pts.length >= 2 && segmentTouchesRect(pts[0], pts[1], r);
    case 'rect': {
      if (pts.length < 2) return false;
      const [[x1, y1], [x2, y2]] = pts;
      return polylineTouchesRect([[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]], r);
    }
    case 'circle': {
      if (pts.length < 2) return false;
      const [[cx, cy], [ex, ey]] = pts;
      const radius = Math.hypot(ex - cx, ey - cy);
      // The ring touches the rect when its radius lies between the nearest and the farthest
      // point of the rect from the centre.
      const nx = Math.max(r.x1, Math.min(cx, r.x2));
      const ny = Math.max(r.y1, Math.min(cy, r.y2));
      const near = Math.hypot(nx - cx, ny - cy);
      const far = Math.max(
        ...[[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]].map(([x, y]) => Math.hypot(x - cx, y - cy))
      );
      return near <= radius && radius <= far;
    }
    case 'text':
      return labelTouchesRect(path, r);
    default:
      return false;
  }
}

// Ids of the paths the marquee touches and the user may select, in scene order.
export function selectPathsInRect(paths, rect, canSelect) {
  return (paths || []).filter(p => canSelect(p) && pathTouchesRect(p, rect)).map(p => p.id);
}

// ── Bounds and moving ──

// Bounding box of what the path paints, in scene px; null for a path with nothing to paint.
export function pathBounds(path) {
  if (!path?.points?.length) return null;
  let pts = path.points;
  let pad = (path.brushSize ?? 3) / 2;
  if (path.tool === 'circle' && pts.length >= 2) {
    const [[cx, cy], [ex, ey]] = pts;
    const radius = Math.hypot(ex - cx, ey - cy);
    pts = [[cx - radius, cy - radius], [cx + radius, cy + radius]];
  } else if (path.tool === 'text') {
    if (!path.text) return null;
    pts = textBoxCorners(path);
    pad = 0;
  }
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad - y };
}

export function groupBounds(paths) {
  const boxes = (paths || []).map(pathBounds).filter(Boolean);
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map(b => b.x));
  const y = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x + b.width));
  const bottom = Math.max(...boxes.map(b => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

// Clamp a group move so the group's box stays on the canvas. One delta for the whole group keeps
// its layout. A group already sticking out may still move back in, never further out.
export function clampDrawingDelta({ dx, dy }, bbox, canvasSize) {
  if (!bbox || !canvasSize) return { dx, dy };
  const clampAxis = (d, start, size, limit) => {
    const min = Math.min(0, -start);
    const max = Math.max(0, limit - (start + size));
    return Math.max(min, Math.min(max, d));
  };
  return {
    dx: clampAxis(dx, bbox.x, bbox.width, canvasSize.width),
    dy: clampAxis(dy, bbox.y, bbox.height, canvasSize.height),
  };
}

export function translatePath(path, dx, dy) {
  return { ...path, points: path.points.map(([x, y]) => [x + dx, y + dy]) };
}

// ── Selection lists ──

export const toggleId = (ids, id) => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

export const unionIds = (a, b) => [...a, ...b.filter(id => !a.includes(id))];
