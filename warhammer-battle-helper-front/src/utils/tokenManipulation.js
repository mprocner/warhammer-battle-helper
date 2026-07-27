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

  // Select tab takes precedence: an explicit tool tab outranks a stale activeTool value from a
  // previous tab. Only on the armed tokens layer, and only for a lone selection — rotating a
  // group would move each token's centre, which is a different operation (see the spec).
  if (editingLayer === 'select') {
    return imageEditLayer === 'tokens' && groupSelected && !multiSelectActive;
  }

  // Pan tab, or the pan tool borrowed inside fog/drawing. Two independent selection states:
  // activeSelected (clicked/active token) vs groupSelected (marquee selection).
  if (editingLayer === null || activeTool === 'pan') return activeSelected;

  // measure / fog / drawing own the pointer.
  return false;
}
