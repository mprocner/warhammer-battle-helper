// genId mints the durable, opaque key a template stores for a field, a skill option, a section,
// a tree node or a weapon preset. It is generated once and never derived from a label, so two
// things can share a name and renaming one never orphans the data filed under its key.
//
// It lives in utils/ because it is the GM side and the player side of ONE contract: the creator
// mints `fld_…` and an option's `opt_…`, and the sheet mints a player's own skill as
// `${field.key}.${genId('skill')}`. Both sides must agree on the shape of a key, so both sides
// read this one definition — it used to exist twice, byte for byte, with nothing tying the copies
// together.
//
// INVARIANT: a minted key must never contain a dot. A dot is the path separator in a skill key,
// and membership of a row in its field is decided by splitting on it — see isDirectChild in
// systems/custom/skillLayout.js, which asks whether anything follows the field's prefix with no
// further dot. A key with a dot in it would silently stop belonging to its own field, and no test
// would catch it: the creator and the sheet have separate fixtures with hand-written keys.
//
// The timestamp is not for ordering, only to keep two keys minted in the same millisecond apart
// from each other together with the random tail.
export function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}
