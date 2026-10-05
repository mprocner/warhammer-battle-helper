// Builds, orders and filters the create-game system picker's options. Kept out of the dialog
// so the grouping and matching rules are testable without rendering MUI.

// A value is either a bare system key (hardcoded Go plugin) or "custom:<templateId>" for a
// system authored in the creator — a template id can never collide with a system key.
export const CUSTOM_PREFIX = 'custom:';

const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
// Date.parse, not string comparison: Go's RFC3339 output has a variable number of fractional digits.
const byUpdatedDesc = (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);

// sharedWithMe, not ownerEmail, decides the group: the email lookup may fail server-side and
// a missing email must not move a template the viewer was given into "public".
const groupOf = (tpl) => {
  if (tpl.isOwner) return 'mine';
  return tpl.sharedWithMe ? 'shared' : 'public';
};

const toOption = (tpl, group) => ({
  value: `${CUSTOM_PREFIX}${tpl.id}`,
  label: tpl.name,
  group,
  ...(group === 'shared' && tpl.ownerEmail ? { ownerEmail: tpl.ownerEmail } : {}),
});

// Array order IS group order: Autocomplete's groupBy only merges adjacent options.
export function buildSystemOptions(systems, templates) {
  const buckets = { mine: [], shared: [], public: [] };
  templates.forEach(tpl => buckets[groupOf(tpl)].push(tpl));
  return [
    ...systems.map(sys => ({ value: sys.value, label: sys.label, group: 'systems' })),
    ...buckets.mine.sort(byUpdatedDesc).map(tpl => toOption(tpl, 'mine')),
    ...buckets.shared.map(tpl => toOption(tpl, 'shared')).sort(byLabel),
    ...buckets.public.map(tpl => toOption(tpl, 'public')).sort(byLabel),
  ];
}

// "ł" is a letter of its own, not "l" plus a combining mark, so NFD leaves it untouched.
const EXTRA_FOLDS = { 'ł': 'l', 'Ł': 'l' };

// Folds one character to its search form, always to exactly one character, so a match index
// in the folded text is also an index in the original label (needed for highlighting).
const foldChar = (c) => {
  if (EXTRA_FOLDS[c]) return EXTRA_FOLDS[c];
  const folded = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return folded.length === 1 ? folded : c;
};

export const normalizeForSearch = (text) => Array.from(text || '').map(foldChar).join('');

// Returns [start, end) of the first match in code points of `text`, or null.
export function findMatch(text, query) {
  const q = Array.from(normalizeForSearch(query.trim()));
  if (q.length === 0) return null;
  const t = Array.from(normalizeForSearch(text));
  for (let i = 0; i + q.length <= t.length; i++) {
    if (q.every((c, j) => t[i + j] === c)) return [i, i + q.length];
  }
  return null;
}

export function filterSystemOptions(options, query) {
  if (!query.trim()) return options;
  return options.filter(opt => findMatch(opt.label, query)
    || (opt.group === 'shared' && opt.ownerEmail && findMatch(opt.ownerEmail, query)));
}
