/**
 * Tree operations for creator templates.
 *
 * A template is a forest: `sections` is the root list, every section owns an ordered
 * `fields` array, and a field of type "section" carries a whole nested section in
 * `field.section`. Fields and subsections therefore share one ordered list, which is what
 * lets a subsection occupy a single cell of its parent's grid.
 *
 * Every helper addresses a node by PATH — an array of indices, e.g. [2, 0, 1] means
 * sections[2].fields[0].section.fields[1]. Paths replace the old {sectionIdx, fieldIdx}
 * pair, which could only describe two levels.
 *
 * All helpers are pure and return new arrays; nothing here touches the DOM, so the whole
 * module is testable with plain jest.
 */

export const SECTION_TYPE = 'section';

// sectionOf normalises the two shapes a "section" comes in: a root SectionDef is already
// one, a section field wraps one. A leaf field is returned as-is and simply has no fields.
export const sectionOf = (node) =>
  node && node.type === SECTION_TYPE ? node.section : node;

// childrenOf returns the ordered child list of a container node, or null for a leaf field.
export const childrenOf = (node) => {
  const section = sectionOf(node);
  return section && Array.isArray(section.fields) ? section.fields : null;
};

// nodeId is the identity a node is addressed by in DnD and in React keys. Root sections
// carry `id`, fields carry `key`, and a section field keeps both in sync (section.id === key).
export const nodeId = (node) => (node ? (node.key ?? node.id) : null);

// locate resolves a path to the node, the list holding it and its index in that list.
export function locate(sections, path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  let list = sections;
  for (let i = 0; i < path.length - 1; i++) {
    const kids = childrenOf(list?.[path[i]]);
    if (!kids) return null;
    list = kids;
  }
  const index = path[path.length - 1];
  const node = list?.[index];
  if (!node) return null;
  return { node, siblings: list, index };
}

export const nodeAt = (sections, path) => locate(sections, path)?.node ?? null;

// isContainer tells a section (of either shape) from a leaf field.
export const isContainer = (node) => childrenOf(node) !== null;

// containerPathFor answers "where would a new node land". A selected section takes it as a
// child; a selected field takes it as a sibling; with nothing selected it goes to the last
// root section. Returns null when the template has no sections at all.
export function containerPathFor(sections, path) {
  if (path === null) return sections.length > 0 ? [sections.length - 1] : null;
  const node = nodeAt(sections, path);
  if (path.length === 1 || (node && node.type === SECTION_TYPE)) return path;
  return path.slice(0, -1);
}

// A section exists in two shapes: a root SectionDef (carries `id`, lives in `sections`) and a
// section field (carries `key` + `type`, lives in a `fields` array and wraps the SectionDef).
// Moving a section across the root boundary has to convert between them — the conversion is
// lossless because section.id and the wrapper key are the same string by invariant.
const asRootSection = (node) => (node.type === SECTION_TYPE ? { ...node.section } : node);

const asFieldNode = (node) =>
  node.key !== undefined ? node : { key: node.id, type: SECTION_TYPE, label: '', section: node };

// withChildren rebuilds a container node around a new child list, for both shapes.
function withChildren(node, fields) {
  return node.type === SECTION_TYPE
    ? { ...node, section: { ...node.section, fields } }
    : { ...node, fields };
}

// mapSiblings replaces the child list living at `parentPath` with fn(list), cloning every
// node along the way so the caller's tree is never mutated. An empty path means the root list.
//
// A path that walks THROUGH a leaf field is a caller bug. Without the guard below,
// withChildren would graft an empty `fields` array onto a real field, turning it into a
// pseudo-container that the creator's autosave then writes to Mongo — silent data
// corruption rather than a thrown error. Returning the node untouched keeps a bad path inert.
function mapSiblings(sections, parentPath, fn) {
  if (parentPath.length === 0) return fn(sections);
  const [head, ...rest] = parentPath;
  return sections.map((node, i) => {
    if (i !== head) return node;
    const kids = childrenOf(node);
    if (kids === null) return node;
    return withChildren(node, mapSiblings(kids, rest, fn));
  });
}

// patchNode applies a property patch where the caller means it: a section's title and
// columns live on its SectionDef, a leaf field's properties on the field itself.
function patchNode(node, patch) {
  return node.type === SECTION_TYPE
    ? { ...node, section: { ...node.section, ...patch } }
    : { ...node, ...patch };
}

export const updateAtPath = (sections, path, patch) =>
  mapSiblings(sections, path.slice(0, -1), (list) =>
    list.map((n, i) => (i === path[path.length - 1] ? patchNode(n, patch) : n)));

export const insertAtPath = (sections, parentPath, index, node) =>
  mapSiblings(sections, parentPath, (list) => {
    const next = [...list];
    next.splice(index < 0 || index > list.length ? list.length : index, 0, node);
    return next;
  });

export const removeAtPath = (sections, path) =>
  mapSiblings(sections, path.slice(0, -1), (list) =>
    list.filter((_, i) => i !== path[path.length - 1]));

export const samePath = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => b[i] === v);

// isAncestorPath is the cycle guard: dropping a section into its own subtree would make the
// node disappear together with the list it was being inserted into.
export const isAncestorPath = (ancestor, descendant) =>
  Array.isArray(ancestor) && Array.isArray(descendant) &&
  ancestor.length < descendant.length && ancestor.every((v, i) => descendant[i] === v);

// shiftPathAfterRemoval fixes a path that pointed past the node just removed. Only indices
// in the removed node's own list move, and only those after it.
function shiftPathAfterRemoval(path, removedPath) {
  const depth = removedPath.length - 1;
  if (path.length <= depth) return path;
  const parent = removedPath.slice(0, depth);
  if (!parent.every((v, i) => path[i] === v)) return path;
  if (path[depth] <= removedPath[depth]) return path;
  const out = [...path];
  out[depth] -= 1;
  return out;
}

// shiftPathAfterInsert is the insert-side mirror of shiftPathAfterRemoval: it fixes a path
// that pointed at a slot which just got pushed one further along by an insertion. The depth
// bound is `path.length > depth` (strictly more, not >=) because a path exactly `depth` long
// addresses the container the node was inserted INTO, not a sibling inside that container's
// list — the container itself never moves when one of its children gets a new sibling.
export function shiftPathAfterInsert(path, insertedPath) {
  if (!Array.isArray(insertedPath) || insertedPath.length === 0) return path;
  const depth = insertedPath.length - 1;
  if (path.length <= depth) return path;
  const parent = insertedPath.slice(0, depth);
  if (!parent.every((v, i) => path[i] === v)) return path;
  if (path[depth] < insertedPath[depth]) return path;
  const out = [...path];
  out[depth] += 1;
  return out;
}

// moveNode relocates a node to `toIndex` in the list at `toParentPath`. `toIndex` is a
// POST-REMOVAL index: it addresses the target list as it looks once the dragged node is gone.
// That is dnd-kit's own convention (its `arrayMove` applies `over`'s index after the removal),
// so the drop lands exactly where the sorting preview showed it, and it matches the arrow
// buttons in TemplateBuilder (moveWithinParent), which have always used post-removal indices.
// A negative index appends — see insertAtPath — which is what a drop sentinel resolves to.
export function moveNode(sections, fromPath, toParentPath, toIndex) {
  if (!Array.isArray(fromPath) || !Array.isArray(toParentPath)) return sections;
  if (isAncestorPath(fromPath, toParentPath) || samePath(fromPath, toParentPath)) return sections;
  const found = locate(sections, fromPath);
  if (!found) return sections;

  // The root list holds SectionDefs, every other list holds fields. A leaf field therefore
  // cannot become a root section, and a section changes shape when it crosses that boundary.
  const toRoot = toParentPath.length === 0;
  if (toRoot && !isContainer(found.node)) return sections;
  const node = toRoot ? asRootSection(found.node) : asFieldNode(found.node);

  const withoutNode = removeAtPath(sections, fromPath);
  const parentPath = shiftPathAfterRemoval(toParentPath, fromPath);
  return insertAtPath(withoutNode, parentPath, toIndex, node);
}

// ── Drop zones ───────────────────────────────────────────────────────────────
//
// A section and a leaf field are both single cells of their parent's grid. A leaf has one
// meaning — "put the dragged node where that card sits" — but a section is also a CONTAINER,
// so hovering it has to be able to mean "put the node inside". Two meanings need two
// droppables, and they are split by DOM ELEMENT, not by geometry: the section's HEADER is
// registered separately and keeps the ordinary "beside me" meaning, everything else about the
// section means "inside me".
//
// An earlier revision split the section's single rect into proportional bands instead (top
// quarter before, middle half into, bottom quarter after). Geometry made the decision depend
// on the layout, and the layout depended on the decision, so the two chased each other. Two
// elements cannot do that: which element the pointer is inside does not change because of
// what we decided it meant.

// canDropInto is the predicate behind the "into" highlight. moveNode refuses the cycle cases
// on its own, but the highlight has to agree with it in advance — a highlight that promises a
// drop the move then refuses is worse than no highlight at all.
//
// Three refusals, all about the tree's own shape:
//  - the node itself and its descendants, which would make it swallow itself (moveNode's
//    cycle guard, restated here so the highlight cannot lie about it);
//  - the node's DIRECT PARENT. Hovering the body of the container a node already sits in is
//    an implicit gesture with no clear meaning — the explicit "move to end of own list"
//    gesture is the append sentinel, which dropIntent lets past. The direct parent is special
//    because it is the only ancestor the node could re-enter at the same level.
//    Grandparents and higher ancestors ARE accepted, so a node can be moved up the tree.
export function canDropInto(sections, fromPath, refPath) {
  if (!Array.isArray(fromPath) || !Array.isArray(refPath) || refPath.length === 0) return false;
  if (samePath(fromPath, refPath) || isAncestorPath(fromPath, refPath)) return false;
  // Refuse the node's direct parent, but accept higher ancestors to allow moving up levels
  const directParentPath = fromPath.slice(0, -1);
  if (samePath(refPath, directParentPath)) return false;
  const from = nodeAt(sections, fromPath);
  const ref = nodeAt(sections, refPath);
  if (!from || !ref) return false;
  return isContainer(ref);
}

// remintKeys gives a copied node a fresh identity. Three cases:
// 1. A section field wrapper (type === 'section'): re-mint its key and nested section id,
//    recurse into nested fields.
// 2. A root SectionDef (isContainer but no type): re-mint its id, recurse into fields,
//    do not add a key property.
// 3. A leaf field (everything else): re-mint its key only; inner ids (skill options,
//    tree nodes) are addressed as "<fieldKey>.<innerId>", so a new field key makes the
//    whole address unique.
function remintKeys(node, mint) {
  if (node.type === SECTION_TYPE) {
    // Nested section wrapper: re-mint key and section.id
    const key = mint(SECTION_TYPE);
    return {
      ...node,
      key,
      section: {
        ...node.section,
        id: key,
        fields: (node.section?.fields || []).map((child) => remintKeys(child, mint)),
      },
    };
  }
  if (isContainer(node)) {
    // Root SectionDef: re-mint id, recurse into fields, no key property
    const id = mint(SECTION_TYPE);
    return {
      ...node,
      id,
      fields: (node.fields || []).map((child) => remintKeys(child, mint)),
    };
  }
  // Leaf field: re-mint key only
  return { ...node, key: mint(node.type) };
}

export function duplicateNodeAtPath(sections, path, { mint, copySuffix }) {
  const found = locate(sections, path);
  if (!found) return sections;
  const copy = remintKeys(JSON.parse(JSON.stringify(found.node)), mint);
  // Apply suffix to section title (both root and nested shapes) or leaf field label
  if (isContainer(copy)) {
    const section = sectionOf(copy);
    section.title = `${section.title || ''} ${copySuffix}`.trim();
  } else if (copy.label) {
    copy.label = `${copy.label} ${copySuffix}`;
  }
  return insertAtPath(sections, path.slice(0, -1), path[path.length - 1] + 1, copy);
}

// DROP_SENTINEL_PREFIX marks the droppable id of a section's APPEND zone — the strip mounted
// after its last child, which is the explicit "put it at the end of this section" gesture and
// the only way to address the slot past the last child (no node id can).
// Not exported: the id builders and the two resolvers below are the whole vocabulary.
const DROP_SENTINEL_PREFIX = '__drop__';

export const dropSentinelId = (sectionId) => `${DROP_SENTINEL_PREFIX}${sectionId}`;

// DROP_HEADER_PREFIX marks the droppable id of a section's HEADER. A section's own id means
// "drop INSIDE me", so without a second droppable the section could no longer be reordered
// among its siblings by dragging something onto it. The header is that second droppable, and
// a header is a place a user aims at deliberately, never somewhere the pointer drifts while
// crossing the section's body.
const DROP_HEADER_PREFIX = '__header__';

export const dropHeaderId = (sectionId) => `${DROP_HEADER_PREFIX}${sectionId}`;

// dropTargetOf translates a droppable id into "which list, at which index", in the three forms
// the canvas registers:
//  - a section's own id, or its append sentinel → that section as the parent at index -1.
//    insertAtPath reads a negative index as "append", so one branch covers both an empty
//    section and appending past the last child of a full one.
//  - a section's header id → the section's PARENT list at the section's own index, i.e. the
//    ordinary sortable "insert here" a leaf field also means.
//  - anything else (a leaf field) → its parent path and its own index.
// An id absent from the map (e.g. a stale id from a tree that just changed) returns null.
// The two prefixes cannot shadow each other: neither is a prefix of the other, and node ids
// are minted as "<type>_<timestamp>_<n>", which never begins with an underscore.
export function dropTargetOf(overId, index, sections) {
  if (overId.startsWith(DROP_HEADER_PREFIX)) {
    const path = index.get(overId.slice(DROP_HEADER_PREFIX.length));
    if (!path) return null;
    return { parentPath: path.slice(0, -1), idx: path[path.length - 1] };
  }
  if (overId.startsWith(DROP_SENTINEL_PREFIX)) {
    const path = index.get(overId.slice(DROP_SENTINEL_PREFIX.length));
    if (!path) return null;
    return { parentPath: path, idx: -1 };
  }
  const path = index.get(overId);
  if (!path) return null;
  if (isContainer(nodeAt(sections, path))) return { parentPath: path, idx: -1 };
  return { parentPath: path.slice(0, -1), idx: path[path.length - 1] };
}

// dropIntent is the SINGLE interpretation of "the pointer is over this droppable": the drop
// and the highlight both read it, so the highlight can never promise a move the drop refuses.
// It returns the arguments for moveNode plus `intoId`, the id of the section that should read
// as receiving the node (null when the drop is an ordinary reorder), or null for a hover that
// means nothing at all.
//
// Nothing here writes to the tree — the caller resolves the intent once, at the drop. The
// previous revision relocated the node during hover to keep the hovered section still; that
// changed the layout, the layout changed the geometry, and the geometry picked the zone, so
// the decision oscillated and React aborted with "Maximum update depth exceeded".
export function dropIntent(sections, fromPath, overId) {
  if (!Array.isArray(fromPath)) return null;
  const id = String(overId);
  const index = indexNodes(sections);
  const target = dropTargetOf(id, index, sections);
  if (!target) return null;

  // Only the two "into" forms append with a negative index; every "beside" target addresses a
  // real slot, so the sign of idx is what separates the two readings.
  if (target.idx >= 0) {
    const refPath = [...target.parentPath, target.idx];
    // "Beside itself" is not a move — it would remove and re-insert the node where it already
    // is, producing a fresh tree and a pointless save.
    if (samePath(refPath, fromPath)) return null;
    // besideId names the hovered LEAF FIELD CARD for the "insertion line" indicator, but only
    // when it lands in a DIFFERENT list than the dragged node's own: within one list, dnd-kit's
    // sortable displacement already previews the gap by shifting the siblings, and a second
    // indicator on top of that would be redundant. The header form of this branch (reordering
    // a SECTION among its own siblings, id starting with DROP_HEADER_PREFIX) keeps its current,
    // indicator-free behaviour — it addresses a container, not a field card, so there is no
    // card edge to draw the line on.
    const besideId = !id.startsWith(DROP_HEADER_PREFIX) && !samePath(target.parentPath, fromPath.slice(0, -1))
      ? id
      : null;
    return { ...target, intoId: null, besideId };
  }

  const intoPath = target.parentPath;
  // Into itself or into its own subtree has no sane fallback: "beside" would be the cycle too.
  if (samePath(intoPath, fromPath) || isAncestorPath(fromPath, intoPath)) return null;

  // The append sentinel is a deliberate gesture, so it keeps working for a node that already
  // lives in that section — that is how a node is moved to the end of its own list. Hovering
  // the section's BODY is implicit, and canDropInto applies a refusal only for the direct
  // parent: that case reads as "beside that container" instead of a pointless re-append.
  // Higher ancestors are accepted to allow moving a node up the tree.
  if (id.startsWith(DROP_SENTINEL_PREFIX) || canDropInto(sections, fromPath, intoPath)) {
    return { ...target, intoId: nodeId(nodeAt(sections, intoPath)), besideId: null };
  }
  return { parentPath: intoPath.slice(0, -1), idx: intoPath[intoPath.length - 1], intoId: null, besideId: null };
}

// indexNodes builds the id → path map the DnD handlers translate through: dnd-kit hands back
// the dragged and hovered ids, and everything downstream works on paths.
export function indexNodes(sections) {
  const map = new Map();
  const visit = (list, prefix) => {
    (list || []).forEach((node, i) => {
      const path = [...prefix, i];
      map.set(nodeId(node), path);
      const kids = childrenOf(node);
      if (kids) visit(kids, path);
    });
  };
  visit(sections, []);
  return map;
}

// walkFields visits every LEAF field depth-first in sheet order, skipping section wrappers.
// It is the single traversal behind duplicate-key detection, the attribute list, the skill
// option list and the token-display field picker.
export function walkFields(sections, fn) {
  const visit = (list) => {
    for (const node of list || []) {
      if (node.type === SECTION_TYPE) visit(node.section?.fields);
      else fn(node);
    }
  };
  for (const section of sections || []) visit(section.fields);
}
