/**
 * Drop-position maths for the creator's WYSIWYG sheet.
 *
 * Every decision here is a pure function of rectangles, for two reasons.
 *
 * Correctness: the layout must not move while a drag is in progress. A CSS grid row is as tall
 * as its tallest cell, so sliding a 200px text area into a row of 40px attributes would change
 * that row's height, push everything below it, put a different element under the pointer and
 * flip the decision that caused the shift — the decision chasing the geometry it changed. The
 * edit view therefore previews a drop with an out-of-flow ghost (see ghostRectFor) and never
 * displaces anything, which is what makes measuring legal AND lets us measure once, at
 * dragStart, instead of on every pointer move.
 *
 * Testability: jsdom has no layout. getBoundingClientRect returns zeros, window.PointerEvent
 * does not exist and document.elementFromPoint is missing, so anything decided inside a DOM
 * handler cannot be tested at all. Keeping the decision here leaves the measuring layer thin
 * enough to verify in a browser instead.
 */

// The sheet grid's gap, from `.custom-sheet__fields--N-col` in style.css. Duplicated as a
// constant because the ghost has to reason about the space between cells, and a test asserts
// the two stay equal.
export const GAP = 8;

const right   = (rect) => rect.left + rect.width;
const bottom  = (rect) => rect.top + rect.height;
const centreX = (rect) => rect.left + rect.width / 2;
const centreY = (rect) => rect.top + rect.height / 2;

const contains = (rect, p) =>
  p.x >= rect.left && p.x <= right(rect) && p.y >= rect.top && p.y <= bottom(rect);

const pathEq = (a, b) => a.length === b.length && a.every((seg, i) => b[i] === seg);

// Two cells share a row when their tops agree to within a pixel. Exact equality is wrong here:
// these rectangles come from getBoundingClientRect, which returns floats, and the sheet's column
// widths are minmax(0, 1fr) divisions that rarely land on whole pixels — so row-mates routinely
// differ in `top` by a fraction of a pixel under browser zoom or DPI scaling. A pixel of slack
// cannot confuse two different rows: rows are separated by a cell height plus the grid gap, and
// the shortest cell on a sheet is far taller than that.
const ROW_TOLERANCE = 1;
const sameRow = (a, b) => Math.abs(a.top - b.top) <= ROW_TOLERANCE;

const isChildOf = (path, parentPath) =>
  path.length === parentPath.length + 1 &&
  parentPath.every((seg, i) => path[i] === seg);

// childrenOf returns a container's direct children in model order. Sorting by the last path
// segment rather than by position keeps the index meaningful when a row wraps.
const childrenOf = (nodes, parentPath) =>
  nodes
    .filter((n) => isChildOf(n.path, parentPath))
    .sort((a, b) => a.path[a.path.length - 1] - b.path[b.path.length - 1]);

const nodeAtPath = (nodes, path) => nodes.find((n) => pathEq(n.path, path)) || null;

// rowsOf groups a container's children into visual rows. A CSS grid fills row by row in model
// order, so grouping by `top` preserves that order: rows[0] is the topmost row, and within a row
// the items keep their model indices.
function rowsOf(children) {
  const rows = [];
  children.forEach((child, index) => {
    const row = rows.find((r) => Math.abs(r.top - child.rect.top) <= ROW_TOLERANCE);
    if (row) row.items.push({ child, index });
    else rows.push({ top: child.rect.top, items: [{ child, index }] });
  });
  // A row is as tall as its tallest cell — the whole reason this feature cannot displace items
  // during a drag.
  rows.forEach((r) => { r.bottom = Math.max(...r.items.map((it) => bottom(it.child.rect))); });
  return rows;
}

// isRowLayout answers "do this node's siblings sit beside it, or above and below it?".
//
// A sibling sharing its `top` settles the question outright. With no row-mate — a lone child, or
// the only cell of its row — the rects cannot say, so ask the question the grid itself asks when
// it decides whether to wrap: would a second cell of this width still fit in the container? In a
// six-column section it would, so the node is laid out horizontally even while alone; in a
// single-column one it would not.
function isRowLayout(node, siblings, container) {
  if (siblings.some((s) => sameRow(s.rect, node.rect) && !pathEq(s.path, node.path))) return true;
  if (!container) return false;
  return node.rect.left + node.rect.width + GAP + node.rect.width <= right(container.rect);
}

// isAfter decides which side of a hit cell the pointer stands on, along whichever axis that
// cell's row actually runs.
function isAfter(pointer, node, siblings, container) {
  return isRowLayout(node, siblings, container)
    ? pointer.x > centreX(node.rect)
    : pointer.y > centreY(node.rect);
}

// indexInContainer places a pointer that is inside a container but over none of its cells.
//
// Three positions, each with one unambiguous answer: inside a row means the pointer is in the
// gap between that row's cells, so it takes the nearest cell and the side it stands on; between
// two rows it belongs to the row below, before that row's first cell; below every row it
// appends. Returning "append" for all three — which the first version did — sent a pointer
// resting between the first two cells of a row to the very end of the section.
function indexInContainer(pointer, children) {
  if (children.length === 0) return 0;

  const rows = rowsOf(children);
  const row = rows.find((r) => pointer.y >= r.top && pointer.y <= r.bottom);

  if (row) {
    const nearest = row.items.reduce((a, b) => (
      Math.abs(pointer.x - centreX(b.child.rect)) < Math.abs(pointer.x - centreX(a.child.rect)) ? b : a
    ));
    return nearest.index + (pointer.x > centreX(nearest.child.rect) ? 1 : 0);
  }

  const rowsAbove = rows.filter((r) => r.bottom < pointer.y);
  if (rowsAbove.length === 0) return 0;
  if (rowsAbove.length === rows.length) return children.length;
  return rows[rowsAbove.length].items[0].index;
}

/**
 * insertionAt decides where a dragged node would land.
 *
 * @param {{x:number,y:number}} pointer
 * @param {Array<{path:number[],rect:{top,left,width,height},container:boolean}>} nodes
 * @returns {{parentPath:number[],index:number}|null} index is the VISUAL index, i.e. it counts
 *   the dragged node if it is still in that list. Pass it through toMoveArgs before moveNode.
 */
export function insertionAt(pointer, nodes) {
  if (!pointer || !Array.isArray(nodes) || nodes.length === 0) return null;

  const hits = nodes.filter((n) => contains(n.rect, pointer));
  if (hits.length === 0) return null;

  // Deepest wins. A field sits inside its section's rect, so both match; the field is the more
  // specific answer, exactly as with hover chrome.
  const deepest = hits.reduce((a, b) => (b.path.length > a.path.length ? b : a));

  if (!deepest.container) {
    const parentPath = deepest.path.slice(0, -1);
    const index = deepest.path[deepest.path.length - 1];
    const siblings = childrenOf(nodes, parentPath);
    const container = nodeAtPath(nodes, parentPath);
    return { parentPath, index: index + (isAfter(pointer, deepest, siblings, container) ? 1 : 0) };
  }

  return { parentPath: deepest.path, index: indexInContainer(pointer, childrenOf(nodes, deepest.path)) };
}

/**
 * toMoveArgs converts a visual insertion point into moveNode's arguments.
 *
 * moveNode takes a POST-REMOVAL index: it addresses the target list as it looks once the
 * dragged node is gone (see utils/templateSections.js). insertionAt counts the list as it looks
 * on screen, with the node still in it. The two differ by exactly one whenever the node is
 * moving forward within its own list — the classic off-by-one of every reorder implementation.
 */
export function toMoveArgs(fromPath, target) {
  const { parentPath, index } = target;
  const fromParent = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1];
  const sameList =
    fromParent.length === parentPath.length &&
    fromParent.every((seg, i) => parentPath[i] === seg);
  const toIndex = sameList && index > fromIndex ? index - 1 : index;
  return { toParentPath: parentPath, toIndex };
}

/**
 * measureNodes takes one layout reading of every node. Called once, on dragStart, because the
 * layout is frozen for the whole drag — so this is the entire DOM contact of the drag system.
 *
 * It is a standalone, callable function rather than an inline read inside the drag handler on
 * purpose: a space-reserving placeholder would need the very same reading taken more often,
 * and that must be a change of call frequency, not a rewrite of the handler.
 *
 * Two constraints on what the caller hands over, neither of which this function can check:
 *
 * A container's `el` must be its GRID element (`.custom-sheet__fields--N-col`), not the section
 * box around it. Both ghostRectFor and isRowLayout ask whether another cell would still fit
 * before the container's right edge, and a section box would offer up its padding and its
 * heading as room in the row.
 *
 * An element that has not been laid out yet returns an all-zero rect, which this function
 * passes through unchanged. Several of those look colocated at the origin to every geometric
 * predicate here. Measuring at drag start, after a full render, is what keeps that from
 * happening — there is no way to detect it from the rect alone.
 */
export function measureNodes(entries) {
  return (entries || [])
    .filter((e) => e && e.el)
    .map(({ path, container, el }) => {
      const { top, left, width, height } = el.getBoundingClientRect();
      return { path, container, rect: { top, left, width, height } };
    });
}

/**
 * ghostRectFor gives the out-of-flow preview its box: where the dragged node would sit.
 *
 * The cell does not exist yet, so the box is inferred from the neighbour it displaces — its
 * column position and width — combined with the dragged node's own height. That approximation
 * is the price of never reflowing: a preview that reserved real space would change the very
 * rectangles insertionAt was measured against.
 *
 * Width comes from the destination, height from the dragged node. The sheet's columns are
 * `repeat(N, minmax(0, 1fr))`, so a field landing in a section becomes as wide as that section's
 * column no matter what it measured before the drag — while its height travels with it, because
 * a grid row is as tall as its tallest cell.
 */
export function ghostRectFor(target, draggedRect, nodes) {
  if (!target || !draggedRect) return null;
  const container = nodeAtPath(nodes || [], target.parentPath);
  if (!container) return null;

  const children = childrenOf(nodes, target.parentPath);
  const height = draggedRect.height;

  if (children.length === 0) {
    const { top, left, width } = container.rect;
    return { top, left, width, height };
  }

  const displaced = children[target.index];
  if (displaced) {
    return { top: displaced.rect.top, left: displaced.rect.left, width: displaced.rect.width, height };
  }

  // Appending: continue the last row if another cell of that width still fits, otherwise
  // start a new line under it.
  const last = children[children.length - 1];
  const nextLeft = right(last.rect) + GAP;
  const fitsInRow = nextLeft + last.rect.width <= right(container.rect);
  return fitsInRow
    ? { top: last.rect.top, left: nextLeft, width: last.rect.width, height }
    : { top: bottom(last.rect) + GAP, left: children[0].rect.left, width: last.rect.width, height };
}
