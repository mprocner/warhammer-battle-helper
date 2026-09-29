// Pure layout arithmetic for skill_table and skill_tree fields. It lives outside
// CustomSheetBody because none of it touches the DOM: jsdom computes no layout at all, so the
// only way these decisions can be tested is to make them in plain data first and render second.

// skillGridTemplate builds ONE grid-template-columns string. A field's header row and every one
// of its data rows must be handed the same string — the moment they are computed separately the
// header drifts away from the values underneath it.
export function skillGridTemplate({
  showDevelopment = false,
  hasAdvances = false,
  showStar = false,
  showRoll = false,
  showActions = false,
} = {}) {
  return [
    showDevelopment && '20px',
    '1fr',
    hasAdvances ? '56px 56px 48px' : '72px',
    showStar && '24px',
    showRoll && '28px',
    showActions && '52px',
  ].filter(Boolean).join(' ');
}

// isDirectChild reports whether a player-added skill key sits immediately under parentPath rather
// than deeper in the tree. Both the flat table and one level of the tree ask the same question, and
// the answer must not be able to drift between them.
function isDirectChild(key, prefix) {
  return key.startsWith(prefix) && !key.slice(prefix.length).includes('.');
}

// buildSkillRows merges a skill_table's GM-defined rows with the player's own additions into one
// list. The player's skills live in stats.customSkillNodes keyed `${field.key}.${id}` — the same
// bag the tree uses, just flat — so a table row and a tree node are the same kind of thing to
// every consumer downstream (rolls, weapon skill selects, the short card).
//
// `newKeys` holds rows the player has just created and not yet named. They stay pinned to the
// bottom so the row being typed into never jumps out from under the cursor when sorting is on.
//
// `sortLabels` freezes the ordering of a row being renamed: it maps a row key to the label that
// row had when the rename began, and sorting uses that instead of the live one. A rename writes
// through on every keystroke, so without this the row would resort itself letter by letter and
// crawl away under the cursor; with it the row holds its place and moves once, when the rename is
// confirmed and the freeze is lifted. The row still carries its live label — only the comparison
// is frozen.
export function buildSkillRows(field, customSkillNodes = {}, newKeys = new Set(), sortLabels = {}) {
  const prefix = `${field.key}.`;
  const rows = (field.skills || []).map(opt => ({
    key: `${field.key}.${opt.id}`,
    label: opt.label || '',
    attr: opt.attr || '',
    custom: false,
    isNew: false,
  }));
  for (const key of Object.keys(customSkillNodes)) {
    // Direct children only: a nested path belongs to a tree field, not to this table.
    if (!isDirectChild(key, prefix)) continue;
    const node = customSkillNodes[key];
    rows.push({
      key,
      label: node.label || '',
      attr: node.linkedAttr || '',
      custom: true,
      isNew: newKeys.has(key),
    });
  }
  if (field.sortAlphabetically) {
    const sortKey = (row) => sortLabels[row.key] ?? row.label;
    rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }
  return [...rows.filter(r => !r.isNew), ...rows.filter(r => r.isNew)];
}

// splitHalf cuts a flat row list into two columns, the odd row going left. Cutting by count is
// right for a table because every row is exactly one line tall.
export function splitHalf(rows) {
  const mid = Math.ceil(rows.length / 2);
  return [rows.slice(0, mid), rows.slice(mid)];
}

// subtreeSize weighs one branch of a tree: itself, its template descendants, and every skill the
// player added anywhere below it. Custom nodes are counted once, by prefix, instead of inside the
// recursion — recursing over them too would count a deep node once per ancestor.
export function subtreeSize(node, path, customSkillNodes = {}) {
  const templateCount = (n) => 1 + (n.children || []).reduce((sum, c) => sum + templateCount(c), 0);
  const prefix = `${path}.`;
  const customCount = Object.keys(customSkillNodes).filter(k => k.startsWith(prefix)).length;
  return templateCount(node) + customCount;
}

// splitBranchesWeighted picks the single cut point whose two halves are closest in weight, leaving
// branch order untouched. Halving by branch count (what a table does) would put a branch with
// twenty children next to three branches with one each and call the columns even.
//
// A tie goes to the earlier cut, i.e. the lighter left column — arbitrary but deterministic, which
// is what a test can assert on.
export function splitBranchesWeighted(branches, weightOf) {
  const weights = branches.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  let cut = 0;
  let bestDiff = Infinity;
  let running = 0;
  for (let i = 0; i < branches.length; i++) {
    running += weights[i];
    const diff = Math.abs(running - (total - running));
    if (diff < bestDiff) {
      bestDiff = diff;
      cut = i + 1;
    }
  }
  return [branches.slice(0, cut), branches.slice(cut)];
}

// siblingItems lists one level of a tree as ONE array: the template's children of parentPath plus
// the player's own direct children of it. Both kinds are wrapped the same way ({ label, node } or
// { label, customKey }) so a single sort and a single render loop can handle them together — they
// used to render as two lists in a row, which is why weaving them alphabetically was impossible.
export function siblingItems(parentPath, templateChildren = [], customSkillNodes = {}) {
  const prefix = `${parentPath}.`;
  const items = templateChildren.map(node => ({ label: node.label || '', node }));
  for (const key of Object.keys(customSkillNodes)) {
    // Direct children only — a deeper path belongs to its own level's call.
    if (!isDirectChild(key, prefix)) continue;
    items.push({ label: customSkillNodes[key].label || '', customKey: key });
  }
  return items;
}

// sortItems orders one level of siblings by label. It is a separate function from siblingItems
// because the tree's root level must be sorted BEFORE it is cut into two columns — otherwise the
// alphabet would read in a zigzag across the columns instead of down each one.
export function sortItems(items, fieldSort) {
  if (!fieldSort) return items;
  return [...items].sort((a, b) => (a.label || '').localeCompare(b.label || ''));
}

// resolveSkillValues answers "what numbers does this row show, and is its base editable". It is the
// one place that knows a derived row's stored `current` is stale: with baseFromAttr the base comes
// from the attribute at read time and nothing ever writes it back, so `current` in stats still holds
// base + advances — 0 + advances — and believing it would show the advances alone as the total.
//
// Mirrors skillValue in internal/systems/custom/roller.go: change one and you must change the other,
// or the roll log and the sheet disagree about the same skill.
//
// baseReadOnly travels with the numbers rather than being recomputed by the caller, because it
// answers the same question as `base` — where the value came from — and a second copy of that
// condition could drift from this one.
export function resolveSkillValues(field, row, skills = {}, attributes = {}) {
  const sv = skills[row.key] || {};
  const advances = sv.advances ?? 0;
  // The flag is meaningless without both preconditions, and a hand-edited template can carry it
  // without them. The creator enforces them; this is the second line of defence.
  const derived = !!field.baseFromAttr && !!field.assignAttrToSkill && !!field.hasAdvances;

  if (derived) {
    const base = row.attr ? (attributes[row.attr]?.current ?? 0) : 0;
    return { base, advances, total: base + advances, baseReadOnly: true };
  }

  const base = sv.base ?? 0;
  return { base, advances, total: sv.current ?? base + advances, baseReadOnly: false };
}
