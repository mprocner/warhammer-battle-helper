// Pure part of the GM's Ctrl+C / Ctrl+V for scene images (useSceneClipboard owns the keys).
// Only images are copied — character tokens are cards, not pictures, and are skipped.

// Copy: the selected images, each as an offset from the top-left corner of the group's bounding
// box, so a pasted group keeps its layout. null when the selection holds no image.
export function buildClipboard(sceneId, selectedTokens, images) {
  const byId = new Map((images || []).map(img => [img.id, img]));
  const picked = selectedTokens
    .filter(t => t.kind === 'image')
    .map(t => byId.get(t.id))
    .filter(Boolean);
  if (picked.length === 0) return null;

  const x = Math.min(...picked.map(i => i.x));
  const y = Math.min(...picked.map(i => i.y));
  const right = Math.max(...picked.map(i => i.x + i.width));
  const bottom = Math.max(...picked.map(i => i.y + i.height));
  return {
    sourceSceneId: sceneId,
    box: { x, y, width: right - x, height: bottom - y },
    items: picked.map(i => ({ imageId: i.id, dx: i.x - x, dy: i.y - y })),
  };
}

// Paste: the group's centre goes under the cursor (anchor, in scene px); snap mode puts its
// top-left on a cell corner. Without an anchor (cursor off the map) the copy lands 30px down-right
// of the original, the same cascade as duplicate. The server clamps into the workspace.
export function pastePositions(clip, anchor, { snap, cellSize }) {
  let left;
  let top;
  if (anchor) {
    left = anchor.x - clip.box.width / 2;
    top = anchor.y - clip.box.height / 2;
    if (snap) {
      left = Math.round(left / cellSize) * cellSize;
      top = Math.round(top / cellSize) * cellSize;
    }
  } else {
    left = clip.box.x + 30;
    top = clip.box.y + 30;
  }
  return clip.items.map(item => ({ imageId: item.imageId, x: left + item.dx, y: top + item.dy }));
}
