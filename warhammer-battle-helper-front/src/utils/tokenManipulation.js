// Decides whether a map token shows its manipulation chrome (resize handles + rotate handle).
// Shared by BOTH token kinds so the two hosts can never drift apart — this rule previously lived
// as two hand-synced inline conditions, one per tool, which is exactly how Select mode ended up
// without handles (BUG-195).
//
// `selected` means "this token is the ONLY one selected". Chrome belongs to a lone token:
// rotating a group would move each token's centre, which is a different operation (see the spec).
// The hosts derive it from the single selection state, so there is nothing left to keep in sync.
export function canManipulateToken({
  allowed = false,
  locked = false,
  editingLayer = 'select',
  imageEditLayer = 'tokens',
  selected = false,
} = {}) {
  if (!allowed || locked) return false;
  // measure / fog / drawing own the pointer — no manipulation chrome there.
  if (editingLayer !== 'select') return false;
  // Characters live on the tokens layer; with another layer armed they are marquee backdrop.
  return imageEditLayer === 'tokens' && selected;
}

// "This token is the lone selected one" — the rule that decides whether a token expands its ring
// and shows manipulation chrome. Both token hosts (MapCharacterToken, SceneImage) derive it from
// the two selection props they already receive, so it lives here rather than as a duplicated
// inline expression: the older split between per-tool selection states is exactly what BUG-195
// removed, and a second copy of this line would start the same drift again.
export const isLoneSelection = (multiSelected, multiSelectActive) => !!multiSelected && !multiSelectActive;
