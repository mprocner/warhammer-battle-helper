// Pure part of Ctrl+C / Ctrl+V for drawings (useDrawingClipboard owns the keys).
import { groupBounds, clampDrawingDelta, translatePath } from './drawingSelection';

// Copy: the selected paths in scene order, without the fields the server assigns (id, owner) —
// a pasted copy is a new drawing of whoever pastes it. null when nothing selected is on the scene.
export function buildDrawingClipboard(sceneId, ids, paths) {
  const wanted = new Set(ids);
  const picked = (paths || []).filter(p => wanted.has(p.id));
  if (picked.length === 0) return null;
  return {
    sourceSceneId: sceneId,
    box: groupBounds(picked),
    paths: picked.map(({ id, userId, ...rest }) => rest),
  };
}

// Paste: the group's centre goes under the cursor (anchor, scene px); without an anchor (cursor
// off the map) the copy lands 30px down-right of the original. Either way the group is then kept
// on the canvas, as a group move would be.
export function pasteDrawingRequests(clip, anchor, canvasSize) {
  const { box } = clip;
  const wanted = anchor
    ? { dx: anchor.x - (box.x + box.width / 2), dy: anchor.y - (box.y + box.height / 2) }
    : { dx: 30, dy: 30 };
  const { dx, dy } = clampDrawingDelta(wanted, box, canvasSize);
  return clip.paths.map(p => translatePath(p, dx, dy));
}
