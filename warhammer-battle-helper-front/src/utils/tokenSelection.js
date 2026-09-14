// The one rule for what a click does to the token selection. Pure, so both token hosts
// (MapCharacterToken, SceneImage) and the tests agree on it without touching React state.
//
// Selection is a list because a marquee picks many at once; a single click is just the
// one-element case. `kind` is part of the identity — an image and a character can carry the
// same id.
//
// A plain click on the ONLY selected token clears the selection: that is how the expanded ring
// gets collapsed without hunting for empty grid (the behaviour the old Pan tool had). On any
// other token it narrows to that one, which is what makes "click one of five" and "click a
// sixth" behave identically.
const keyOf = (t) => `${t.kind}:${t.id}`;

export function nextSelection(prev, token, additive) {
  const key = keyOf(token);
  const has = prev.some(t => keyOf(t) === key);
  if (additive) {
    return has ? prev.filter(t => keyOf(t) !== key) : [...prev, token];
  }
  if (has && prev.length === 1) return [];
  return [token];
}
