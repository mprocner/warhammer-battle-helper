import { CELL_SIZE, OFFSCENE_MARGIN_CELLS } from '../constants/scene';

// Canonical token geometry shared by BOTH kinds of map tokens (characters + images).
//
// The canonical unit is GRID CELLS (floats, so the "free" placement mode can put a token
// at 3.27 / 5.81 — not only on whole cells). Characters already live in this space
// (positionX/Y = col/row). Images live in pixels (x/y/width/height); the adapter converts
// them by dividing by CELL_SIZE, so we never touch the SceneImage schema.
//
// CellRect = { col, row, w, h }  — col/row = top-left corner, w/h = size, all in cells.

export function rectPx({ col, row, w, h }) {
  return { x: col * CELL_SIZE, y: row * CELL_SIZE, width: w * CELL_SIZE, height: h * CELL_SIZE };
}

export function cellRectFromPx({ x, y, width, height }) {
  return { col: x / CELL_SIZE, row: y / CELL_SIZE, w: width / CELL_SIZE, h: height / CELL_SIZE };
}

// Center of a token in cell units — used for distance and for large-token measuring.
export function centerOf({ col, row, w, h }) {
  return { col: col + w / 2, row: row + h / 2 };
}

// Whole cells a token occupies — used ONLY in snap mode (collision checks). Never called
// in free mode, where "occupied cell" has no meaning.
export function cellsOf({ col, row, w, h }) {
  const cells = [];
  const c0 = Math.round(col);
  const r0 = Math.round(row);
  const w0 = Math.max(1, Math.round(w));
  const h0 = Math.max(1, Math.round(h));
  for (let dr = 0; dr < h0; dr++) {
    for (let dc = 0; dc < w0; dc++) cells.push({ col: c0 + dc, row: r0 + dr });
  }
  return cells;
}

export function snapToGrid({ col, row, w, h }) {
  return {
    col: Math.round(col),
    row: Math.round(row),
    w: Math.max(1, Math.round(w)),
    h: Math.max(1, Math.round(h)),
  };
}

// distanceBetween measures center-to-center in cell units, then applies the chosen metric.
// metric: 'euclidean' (straight line, e.g. inches), 'chebyshev' (each cell incl. diagonal = 1),
// 'alternating' (5-10-5: every second diagonal step costs 2 — D&D 3.5 style).
export function distanceBetween(a, b, metric = 'euclidean') {
  const ca = centerOf(a);
  const cb = centerOf(b);
  const dx = Math.abs(ca.col - cb.col);
  const dy = Math.abs(ca.row - cb.row);
  switch (metric) {
    case 'chebyshev':
      return Math.max(dx, dy);
    case 'alternating': {
      const diag = Math.min(dx, dy);
      const straight = Math.max(dx, dy) - diag;
      return straight + diag + Math.floor(diag / 2);
    }
    case 'euclidean':
    default:
      return Math.sqrt(dx * dx + dy * dy);
  }
}

// Human-readable distance for the ruler badge: the measured cell count scaled by the per-game
// cell size and labelled with the configured unit (e.g. 3 cells × 5 → "15 ft").
export function formatDistance(distance, cellDistance = 1, unit = '') {
  const v = distance * cellDistance;
  const rounded = Math.round(v * 10) / 10;
  const num = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return unit ? `${num} ${unit}` : num;
}

// Snaps a cell point to the nearest token center within that token's radius, so the ruler
// measures large tokens center-to-center. targets: [{ col, row, radius }] (centers in cells).
// Returns the snapped center, or the original point if none is close enough.
export function snapPointToTokens(point, targets) {
  let best = null;
  let bestDist = Infinity;
  for (const target of targets) {
    const dx = point.col - target.col;
    const dy = point.row - target.row;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= target.radius && d < bestDist) {
      best = target;
      bestDist = d;
    }
  }
  return best ? { col: best.col, row: best.row } : point;
}

// --- MapToken adapter (anti-corruption layer) ------------------------------------------
// Unifies GameCharacter and SceneImage into one shape. The renderer reads tokens ONLY
// through this — never image.x / character.positionX directly.
// { id, kind: 'character'|'image', col, row, w, h, rotation, zIndex, locked, raw }

export function characterToMapToken(gc) {
  return {
    id: gc.characterId, // GameCharacter.characterId, NOT GameCharacter.id
    kind: 'character',
    col: gc.positionX || 0,
    row: gc.positionY || 0,
    w: gc.w || 1, // defensive fallback for pre-w/h documents (zero value)
    h: gc.h || 1,
    rotation: gc.rotation || 0, // visual facing only — never changes the token's w/h footprint
    zIndex: gc.zIndex || 0,
    locked: false, // characters have no "locked" concept
    raw: gc,
  };
}

export function imageToMapToken(img) {
  const { col, row, w, h } = cellRectFromPx(img);
  return {
    id: img.id,
    kind: 'image',
    col,
    row,
    w,
    h,
    rotation: img.rotation || 0,
    zIndex: img.zIndex || 0,
    locked: !!img.locked,
    raw: img,
  };
}

// --- Player visibility -----------------------------------------------------------------
// What "players cannot see this token" means, in the RAW (pre-adapter) shapes. Both privacy gates
// on the map read these, so the drag ruler (isPrivateDrag) and the measuring ruler's snap targets
// can never drift apart on the definition.

// A character placement is private purely by its hidden flag.
export function isCharacterPlacementPrivate(gc) {
  return !!gc.hidden;
}

// An image is private when hidden OR when it lives on the gm layer, which players never render.
export function isImagePrivate(img) {
  return !!img.hidden || img.layer === 'gm';
}

// Token centres the measuring ruler magnetizes to, so large tokens are measured centre-to-centre.
// Returns [{ col, row, radius }] in cells, for snapPointToTokens.
//
// Tokens players cannot see are EXCLUDED (FEATURE-135). The manual ruler broadcasts its endpoints,
// so snapping one onto a hidden token would publish that token's exact centre — BUG-178's leak,
// reopened through the manual tool. Accepted trade-off: the GM loses centre-snapping onto a hidden
// token; freehand measuring to it still works. Players who do NOT hold the character's card are
// unaffected — the backend strips hidden placements from their scene payload
// (keepSceneCharacterForViewer = !gc.Hidden || hasCard), so their target list never held them.
// A player who DOES hold the card receives the hidden placement, and therefore loses centre-snapping
// on a token they can legitimately see. Harmless (freehand measuring still works) but real: the
// filter is by hidden flag, not by what this particular viewer can see.
//
// `null` is guarded INSIDE, not by a default parameter: defaults apply to `undefined` only, while Go
// marshals a nil slice as JSON `null` and neither Scene.Characters nor Scene.Images carries
// `omitempty` (models/Game.go) — a freshly created scene really does arrive as `characters: null`.
// Without the guard this throws during SceneViewport's render, blanking the whole scene.
export function buildRulerSnapTargets({ characters, images } = {}) {
  const targets = [];
  const push = (tk) => {
    const c = centerOf(tk);
    targets.push({ col: c.col, row: c.row, radius: Math.max(tk.w, tk.h) / 2 });
  };
  (characters || []).forEach(gc => {
    if (isCharacterPlacementPrivate(gc)) return;
    push(characterToMapToken(gc));
  });
  (images || []).forEach(img => {
    // Only the tokens layer measures centre-to-centre; background/gm art is not a ruler target.
    if (img.layer !== 'tokens' || isImagePrivate(img)) return;
    push(imageToMapToken(img));
  });
  return targets;
}

// AABB overlap in cell units. Edge-touch (shared boundary, zero area) counts as NO overlap,
// so a marquee that merely grazes a token's edge doesn't grab it.
export function rectsIntersect(a, b) {
  return (
    a.col < b.col + b.w &&
    a.col + a.w > b.col &&
    a.row < b.row + b.h &&
    a.row + a.h > b.row
  );
}

// Bounding box (CellRect) wrapping every rect. null for an empty list.
export function unionRect(rects) {
  if (!rects.length) return null;
  let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
  for (const r of rects) {
    minC = Math.min(minC, r.col);
    minR = Math.min(minR, r.row);
    maxC = Math.max(maxC, r.col + r.w);
    maxR = Math.max(maxR, r.row + r.h);
  }
  return { col: minC, row: minR, w: maxC - minC, h: maxR - minR };
}

// candidates: [{ kind, id, rect }]. Returns [{ kind, id }] whose rect intersects the marquee.
export function selectTokensInRect(rect, candidates) {
  return candidates
    .filter(c => rectsIntersect(rect, c.rect))
    .map(({ kind, id }) => ({ kind, id }));
}

// Clamp a cell-space drag delta so the whole selection stays in bounds. Clamping the group's
// bounding box (not each token) preserves the tokens' relative layout.
//
// The two kinds obey different limits: character tokens must stay inside the grid, images may
// travel into the off-scene margin. A mixed selection moves as one vector, so BOTH constraints
// apply and the tighter one wins on each axis. Either bbox may be null when the selection holds
// only one kind.
export function clampGroupDelta(delta, { charBbox, imageBbox }, gridWidth, gridHeight) {
  let { dCol, dRow } = delta;

  const applyBounds = (bbox, minCol, minRow, maxCol, maxRow) => {
    if (!bbox) return;
    dCol = Math.max(dCol, minCol - bbox.col);
    dCol = Math.min(dCol, maxCol - (bbox.col + bbox.w));
    dRow = Math.max(dRow, minRow - bbox.row);
    dRow = Math.min(dRow, maxRow - (bbox.row + bbox.h));
  };

  applyBounds(charBbox, 0, 0, gridWidth, gridHeight);
  applyBounds(
    imageBbox,
    -OFFSCENE_MARGIN_CELLS,
    -OFFSCENE_MARGIN_CELLS,
    gridWidth + OFFSCENE_MARGIN_CELLS,
    gridHeight + OFFSCENE_MARGIN_CELLS,
  );

  return { dCol, dRow };
}

// Clamp an image's pixel position to the GM workspace: the grid plus the off-scene margin on every
// side. Images — unlike character tokens, which stay inside the grid — may be staged out here and
// slid in mid-game. Operates on the raw (unrotated) rect, matching what SceneImage stores.
export function clampToWorkspace(x, y, width, height, gridWidth, gridHeight) {
  const margin = OFFSCENE_MARGIN_CELLS * CELL_SIZE;
  // For an image wider/taller than the workspace, this can come out below -margin; the outer
  // Math.max(-margin, ...) below still floors the result there, so the image stays draggable
  // instead of becoming unreachable.
  const maxX = gridWidth * CELL_SIZE + margin - width;
  const maxY = gridHeight * CELL_SIZE + margin - height;
  return {
    x: Math.max(-margin, Math.min(x, maxX)),
    y: Math.max(-margin, Math.min(y, maxY)),
  };
}

// Caps an image's size at the workspace span (grid + margin on both sides) on each axis
// independently. An image wider or taller than the whole workspace has no position that keeps
// it inside — clampToWorkspace's own floor (see the comment above) would otherwise leave its far
// edge sticking out past the margin no matter where it's dragged, and the server rejects that
// write outright. Capping the size first is what makes a valid position exist at all.
export function clampSizeToWorkspace(width, height, gridWidth, gridHeight) {
  const span = OFFSCENE_MARGIN_CELLS * CELL_SIZE * 2;
  const maxWidth = gridWidth * CELL_SIZE + span;
  const maxHeight = gridHeight * CELL_SIZE + span;
  return {
    width: Math.min(width, maxWidth),
    height: Math.min(height, maxHeight),
  };
}
