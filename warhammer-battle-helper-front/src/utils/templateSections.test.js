import {
  SECTION_TYPE, childrenOf, nodeAt, updateAtPath, insertAtPath, removeAtPath,
  moveNode, duplicateNodeAtPath, indexNodes, walkFields, isAncestorPath,
  shiftPathAfterInsert, containerPathFor, dropSentinelId, dropHeaderId,
  dropTargetOf, dropIntent, canDropInto,
} from './templateSections';

// Fixture: two root sections; the second holds a field, a nested section with two fields,
// and that nested section holds a deeper section — three levels in total.
const makeTree = () => ([
  { id: 'sec_a', title: 'A', columns: 3, fields: [
    { key: 'attr_1', type: 'attr', label: 'Siła' },
  ] },
  { id: 'sec_b', title: 'B', columns: 2, fields: [
    { key: 'num_1', type: 'number', label: 'Złoto' },
    { key: 'sec_c', type: SECTION_TYPE, label: '', section: { id: 'sec_c', title: 'C', columns: 2, fields: [
      { key: 'attr_2', type: 'attr', label: 'Zręczność' },
      { key: 'sec_d', type: SECTION_TYPE, label: '', section: { id: 'sec_d', title: 'D', columns: 1, fields: [
        { key: 'txt_1', type: 'text_short', label: 'Notka' },
      ] } },
    ] } },
  ] },
]);

let mintCounter = 0;
const mint = (prefix) => `${prefix}_mint${++mintCounter}`;
beforeEach(() => { mintCounter = 0; });

describe('childrenOf', () => {
  test('returns fields of a root section', () => {
    expect(childrenOf(makeTree()[0]).map(f => f.key)).toEqual(['attr_1']);
  });

  test('unwraps a section field to its nested fields', () => {
    const wrapper = makeTree()[1].fields[1];
    expect(childrenOf(wrapper).map(f => f.key)).toEqual(['attr_2', 'sec_d']);
  });

  test('returns null for a leaf field', () => {
    expect(childrenOf(makeTree()[0].fields[0])).toBeNull();
  });
});

describe('nodeAt', () => {
  test('addresses a leaf three levels deep', () => {
    expect(nodeAt(makeTree(), [1, 1, 1, 0]).key).toBe('txt_1');
  });

  test('returns null for a path that runs off the tree', () => {
    expect(nodeAt(makeTree(), [1, 1, 9])).toBeNull();
  });

  test('returns null for an empty path', () => {
    expect(nodeAt(makeTree(), [])).toBeNull();
  });
});

describe('updateAtPath', () => {
  test('patches a nested section title on its SectionDef, not on the wrapper', () => {
    const next = updateAtPath(makeTree(), [1, 1], { title: 'Broń' });
    expect(next[1].fields[1].section.title).toBe('Broń');
    expect(next[1].fields[1].title).toBeUndefined();
  });

  test('patches a root section directly', () => {
    expect(updateAtPath(makeTree(), [0], { columns: 6 })[0].columns).toBe(6);
  });

  test('patches a leaf field directly', () => {
    expect(updateAtPath(makeTree(), [0, 0], { label: 'S' })[0].fields[0].label).toBe('S');
  });

  test('does not mutate the input', () => {
    const tree = makeTree();
    updateAtPath(tree, [1, 1], { title: 'X' });
    expect(tree[1].fields[1].section.title).toBe('C');
  });
});

describe('insertAtPath / removeAtPath', () => {
  test('inserts into a nested section at an index', () => {
    const node = { key: 'new_1', type: 'checkbox', label: '' };
    const next = insertAtPath(makeTree(), [1, 1], 1, node);
    expect(next[1].fields[1].section.fields.map(f => f.key)).toEqual(['attr_2', 'new_1', 'sec_d']);
  });

  test('inserts into the root list with an empty parent path', () => {
    const node = { id: 'sec_new', title: '', columns: 3, fields: [] };
    expect(insertAtPath(makeTree(), [], 0, node).map(s => s.id)).toEqual(['sec_new', 'sec_a', 'sec_b']);
  });

  test('removes a nested section together with its whole subtree', () => {
    const next = removeAtPath(makeTree(), [1, 1]);
    expect(next[1].fields.map(f => f.key)).toEqual(['num_1']);
  });
});

describe('moveNode', () => {
  test('moves a leaf from a root section into a section two levels down', () => {
    const next = moveNode(makeTree(), [0, 0], [1, 1, 1], 0);
    expect(next[0].fields).toHaveLength(0);
    expect(next[1].fields[1].section.fields[1].section.fields.map(f => f.key)).toEqual(['attr_1', 'txt_1']);
  });

  // toIndex is a POST-REMOVAL index, which is dnd-kit's own convention: `over`'s index is
  // read off the array that still contains the dragged node, and arrayMove applies it after
  // the removal. These four cases are exactly arrayMove's results on [A, B, C], so a drop
  // lands where the sorting preview showed it. An earlier revision subtracted one for a
  // downward move, which made "drag down one slot" a no-op and the last slot unreachable.
  const abc = () => ([{ id: 'sec', title: '', columns: 1, fields: [
    { key: 'A', type: 'attr' }, { key: 'B', type: 'attr' }, { key: 'C', type: 'attr' },
  ] }]);
  const order = (tree) => tree[0].fields.map(f => f.key);

  test('drags one slot down: A onto B lands after B, like arrayMove(0, 1)', () => {
    expect(order(moveNode(abc(), [0, 0], [0], 1))).toEqual(['B', 'A', 'C']);
  });

  test('drags onto the last slot: A onto C lands last, like arrayMove(0, 2)', () => {
    expect(order(moveNode(abc(), [0, 0], [0], 2))).toEqual(['B', 'C', 'A']);
  });

  test('drags upward: C onto A lands first, like arrayMove(2, 0)', () => {
    expect(order(moveNode(abc(), [0, 2], [0], 0))).toEqual(['C', 'A', 'B']);
  });

  test('drags onto its own current position and nothing moves', () => {
    expect(order(moveNode(abc(), [0, 0], [0], 0))).toEqual(['A', 'B', 'C']);
    expect(order(moveNode(abc(), [0, 1], [0], 1))).toEqual(['A', 'B', 'C']);
  });

  test('appends to the end of its own list on a negative (sentinel) index', () => {
    expect(order(moveNode(abc(), [0, 0], [0], -1))).toEqual(['B', 'C', 'A']);
  });

  test('reorders within a nested parent using post-removal indices', () => {
    const next = moveNode(makeTree(), [1, 0], [1], 1);
    expect(next[1].fields.map(f => f.key)).toEqual(['sec_c', 'num_1']);
  });

  test('refuses to drop a section inside its own subtree', () => {
    const tree = makeTree();
    expect(moveNode(tree, [1, 1], [1, 1, 1], 0)).toBe(tree);
  });

  test('refuses to drop a node into the parent slot it already occupies', () => {
    const tree = makeTree();
    expect(moveNode(tree, [1, 1], [1, 1], 0)).toBe(tree);
  });

  test('shifts a target path that sits after the removed node in the same list', () => {
    // Move root section A into section B: the target parent [1] must become [0] after removal.
    const next = moveNode(makeTree(), [0], [1], 0);
    expect(next).toHaveLength(1);
    expect(next[0].fields[0].key).toBe('sec_a');
  });

  test('wraps a root section into a section field when it moves inside another section', () => {
    const moved = moveNode(makeTree(), [0], [1], 0)[0].fields[0];
    expect(moved.type).toBe(SECTION_TYPE);
    expect(moved.key).toBe('sec_a');
    expect(moved.section.id).toBe('sec_a');
    expect(moved.section.title).toBe('A');
    expect(moved.section.fields.map(f => f.key)).toEqual(['attr_1']);
  });

  test('unwraps a nested section into a root SectionDef when it moves to the root list', () => {
    const next = moveNode(makeTree(), [1, 1], [], 0);
    expect(next[0].id).toBe('sec_c');
    expect(next[0].type).toBeUndefined();
    expect(next[0].title).toBe('C');
    expect(next[0].fields.map(f => f.key)).toEqual(['attr_2', 'sec_d']);
  });

  test('refuses to move a leaf field into the root list', () => {
    const tree = makeTree();
    expect(moveNode(tree, [0, 0], [], 0)).toBe(tree);
  });
});

describe('duplicateNodeAtPath', () => {
  test('re-mints every descendant key of a copied section', () => {
    const next = duplicateNodeAtPath(makeTree(), [1, 1], { mint, copySuffix: '(kopia)' });
    const copy = next[1].fields[2];
    const original = next[1].fields[1];
    expect(copy.key).not.toBe(original.key);
    expect(copy.section.fields[0].key).not.toBe('attr_2');
    expect(copy.section.fields[1].section.fields[0].key).not.toBe('txt_1');
  });

  test('keeps section.id equal to the wrapper key in the copy', () => {
    const copy = duplicateNodeAtPath(makeTree(), [1, 1], { mint, copySuffix: '(kopia)' })[1].fields[2];
    expect(copy.section.id).toBe(copy.key);
    expect(copy.section.fields[1].section.id).toBe(copy.section.fields[1].key);
  });

  test('suffixes a section copy title and a field copy label', () => {
    const next = duplicateNodeAtPath(makeTree(), [1, 1], { mint, copySuffix: '(kopia)' });
    expect(next[1].fields[2].section.title).toBe('C (kopia)');
    const withField = duplicateNodeAtPath(makeTree(), [0, 0], { mint, copySuffix: '(kopia)' });
    expect(withField[0].fields[1].label).toBe('Siła (kopia)');
  });

  test('leaves the inner ids of a plain field alone', () => {
    const tree = [{ id: 'sec_a', title: '', columns: 1, fields: [
      { key: 'st_1', type: 'skill_table', skills: [{ id: 'opt_1', label: 'Skradanie' }] },
    ] }];
    const copy = duplicateNodeAtPath(tree, [0, 0], { mint, copySuffix: '(kopia)' })[0].fields[1];
    expect(copy.skills[0].id).toBe('opt_1');
    expect(copy.key).not.toBe('st_1');
  });
});

describe('indexNodes', () => {
  test('maps every node id to its path, root sections by id and fields by key', () => {
    const map = indexNodes(makeTree());
    expect(map.get('sec_a')).toEqual([0]);
    expect(map.get('num_1')).toEqual([1, 0]);
    expect(map.get('sec_c')).toEqual([1, 1]);
    expect(map.get('txt_1')).toEqual([1, 1, 1, 0]);
  });
});

describe('duplicateNodeAtPath (root section)', () => {
  test('duplicating a root section re-mints its id and all descendant keys', () => {
    const tree = [
      { id: 'sec_root', title: 'Root', columns: 2, fields: [
        { key: 'attr_leaf', type: 'attr', label: 'Leaf Field' },
        { key: 'sec_nested', type: SECTION_TYPE, label: '', section: { id: 'sec_nested', title: 'Nested', columns: 1, fields: [
          { key: 'attr_nested', type: 'attr', label: 'Nested Leaf' },
        ] } },
      ] },
    ];
    const next = duplicateNodeAtPath(tree, [0], { mint, copySuffix: '(copy)' });
    const copy = next[1];
    const original = next[0];

    // Copy has a new id different from original
    expect(copy.id).not.toBe(original.id);
    expect(copy.id).toBe('section_mint1');

    // Copy has no key property (root sections don't have keys)
    expect(copy.key).toBeUndefined();

    // All descendant keys are re-minted at both levels
    expect(copy.fields[0].key).not.toBe('attr_leaf');
    expect(copy.fields[1].key).not.toBe('sec_nested');
    expect(copy.fields[1].section.fields[0].key).not.toBe('attr_nested');

    // Nested section still has section.id === key invariant
    expect(copy.fields[1].section.id).toBe(copy.fields[1].key);

    // Title is suffixed for the copy, original unchanged
    expect(copy.title).toBe('Root (copy)');
    expect(original.title).toBe('Root');
  });
});

describe('walkFields', () => {
  test('visits leaf fields in sheet order and skips section wrappers', () => {
    const seen = [];
    walkFields(makeTree(), f => seen.push(f.key));
    expect(seen).toEqual(['attr_1', 'num_1', 'attr_2', 'txt_1']);
  });
});

describe('isAncestorPath', () => {
  test('is true for a strict prefix and false for equal or unrelated paths', () => {
    expect(isAncestorPath([1, 1], [1, 1, 0])).toBe(true);
    expect(isAncestorPath([1, 1], [1, 1])).toBe(false);
    expect(isAncestorPath([1, 1], [1, 0, 0])).toBe(false);
  });
});

describe('shiftPathAfterInsert', () => {
  test('shifts a selection under a node inserted before it in the same list', () => {
    // Reproduction from FEATURE-211 review: duplicating the second root section (path [1])
    // inserts its copy at [2], so a selection inside the third root section ([2, 0]) must
    // move to [3, 0] to keep addressing the same field, not the copy.
    expect(shiftPathAfterInsert([2, 0], [2])).toEqual([3, 0]);
  });

  test('shifts when the inserted index equals the path index (new node takes that slot)', () => {
    expect(shiftPathAfterInsert([0, 2], [0, 2])).toEqual([0, 3]);
  });

  test('does not shift a path before the inserted index', () => {
    expect(shiftPathAfterInsert([0, 0], [0, 2])).toEqual([0, 0]);
  });

  test('does not shift a path in an unrelated list', () => {
    expect(shiftPathAfterInsert([1, 3], [0, 1])).toEqual([1, 3]);
  });

  test('does not shift a path shorter than or equal to the insertion depth: the container itself never moves', () => {
    // path [0] addresses the container a node was inserted into at [0, 2] — the container's
    // own position in ITS parent list is unaffected by a new child appearing inside it.
    expect(shiftPathAfterInsert([0], [0, 2])).toEqual([0]);
  });

  test('does not shift a path shallower than the insertion depth even when its own index is large', () => {
    expect(shiftPathAfterInsert([1], [2])).toEqual([1]);
  });

  test('returns the path unchanged if insertedPath is empty or missing', () => {
    expect(shiftPathAfterInsert([1, 2], [])).toEqual([1, 2]);
    expect(shiftPathAfterInsert([1, 2], null)).toEqual([1, 2]);
    expect(shiftPathAfterInsert([1, 2], undefined)).toEqual([1, 2]);
  });
});

describe('containerPathFor', () => {
  test('a selected root section returns its own path', () => {
    expect(containerPathFor(makeTree(), [1])).toEqual([1]);
  });

  test('a selected nested section (type === SECTION_TYPE) returns its own path', () => {
    expect(containerPathFor(makeTree(), [1, 1])).toEqual([1, 1]);
  });

  test('a selected leaf field returns its parent path', () => {
    expect(containerPathFor(makeTree(), [1, 0])).toEqual([1]);
  });

  test('null selection falls back to the last root section', () => {
    expect(containerPathFor(makeTree(), null)).toEqual([1]);
  });

  test('null selection on an empty template returns null', () => {
    expect(containerPathFor([], null)).toBeNull();
  });
});

// A droppable id comes in three forms, and each one says something different:
//  - a section's own id, or its append sentinel → "put the node INSIDE that section";
//  - a section's HEADER id → "put the node beside that section, among its siblings";
//  - a leaf field's id → "put the node where that field sits".
describe('dropTargetOf', () => {
  // Empty root section (no fields) and an empty nested section, to exercise the sentinel.
  const treeWithEmptySections = () => ([
    { id: 'sec_empty', title: 'Empty', columns: 1, fields: [] },
    { id: 'sec_b', title: 'B', columns: 2, fields: [
      { key: 'sec_c', type: SECTION_TYPE, label: '', section: { id: 'sec_c', title: 'C', columns: 1, fields: [] } },
    ] },
  ]);

  // "Into" is APPEND, expressed as a negative index that insertAtPath clamps to the end of
  // the list. One branch then serves both an empty section (nothing to append after) and a
  // full one (appending past the last child, which no node id can ever address).
  test('a root section id resolves to that section as parent, appending', () => {
    const tree = makeTree();
    expect(dropTargetOf('sec_b', indexNodes(tree), tree)).toEqual({ parentPath: [1], idx: -1 });
  });

  test('a nested section wrapper id resolves to the nested section as parent, appending', () => {
    const tree = makeTree();
    expect(dropTargetOf('sec_c', indexNodes(tree), tree)).toEqual({ parentPath: [1, 1], idx: -1 });
  });

  test('a sentinel for a root section resolves to that section as parent, appending', () => {
    const tree = treeWithEmptySections();
    expect(dropTargetOf(dropSentinelId('sec_empty'), indexNodes(tree), tree)).toEqual({ parentPath: [0], idx: -1 });
  });

  test('a sentinel for a nested section resolves to the nested section as parent, appending', () => {
    const tree = treeWithEmptySections();
    expect(dropTargetOf(dropSentinelId('sec_c'), indexNodes(tree), tree)).toEqual({ parentPath: [1, 0], idx: -1 });
  });

  test('a sentinel for a NON-empty section appends after its last child', () => {
    const tree = makeTree();
    const target = dropTargetOf(dropSentinelId('sec_b'), indexNodes(tree), tree);
    expect(target).toEqual({ parentPath: [1], idx: -1 });
    const next = moveNode(tree, [0, 0], target.parentPath, target.idx);
    expect(next[1].fields.map(f => f.key)).toEqual(['num_1', 'sec_c', 'attr_1']);
  });

  // The header is the one part of a section that keeps the ordinary sortable meaning, so a
  // section can still be reordered among its siblings instead of swallowing the dragged node.
  test('a root section header id resolves to the root list and that section index', () => {
    const tree = makeTree();
    expect(dropTargetOf(dropHeaderId('sec_b'), indexNodes(tree), tree)).toEqual({ parentPath: [], idx: 1 });
  });

  test('a nested section header id resolves to its parent list and its own index', () => {
    const tree = makeTree();
    expect(dropTargetOf(dropHeaderId('sec_c'), indexNodes(tree), tree)).toEqual({ parentPath: [1], idx: 1 });
  });

  test('a leaf field id resolves to its parent path and its own index', () => {
    const tree = makeTree();
    expect(dropTargetOf('num_1', indexNodes(tree), tree)).toEqual({ parentPath: [1], idx: 0 });
  });

  test('an unknown id returns null in all three forms', () => {
    const tree = makeTree();
    const index = indexNodes(tree);
    expect(dropTargetOf('nope', index, tree)).toBeNull();
    expect(dropTargetOf(dropSentinelId('nope'), index, tree)).toBeNull();
    expect(dropTargetOf(dropHeaderId('nope'), index, tree)).toBeNull();
  });
});

describe('walkFields as the shared traversal', () => {
  test('finds a skill_table nested two levels down', () => {
    const tree = [{ id: 'sec_a', title: '', columns: 1, fields: [
      { key: 'sec_b', type: SECTION_TYPE, section: { id: 'sec_b', title: '', columns: 1, fields: [
        { key: 'st_1', type: 'skill_table', skills: [{ id: 'opt_1', label: 'Skradanie' }] },
      ] } },
    ] }];
    const found = [];
    walkFields(tree, f => { if (f.type === 'skill_table') found.push(f.key); });
    expect(found).toEqual(['st_1']);
  });

  test('is a no-op traversal for an empty or missing section list', () => {
    const seen = [];
    walkFields(undefined, f => seen.push(f));
    walkFields([], f => seen.push(f));
    expect(seen).toEqual([]);
  });
});

describe('paths that walk through a leaf field', () => {
  // Six callers hand-compute paths into these helpers. A path one segment too long walks
  // THROUGH a leaf, and rebuilding a container around it would graft `fields: []` onto a real
  // field — a pseudo-container the creator's autosave writes straight to Mongo. A bad path
  // must be inert, not corrupting: the tree comes back untouched.
  test('insertAtPath does not turn a leaf field into a container', () => {
    const tree = makeTree();
    const next = insertAtPath(tree, [0, 0], 0, { key: 'x', type: 'checkbox' });
    expect(next[0].fields[0].fields).toBeUndefined();
    expect(next[0].fields[0].key).toBe('attr_1');
  });

  test('updateAtPath does not turn a leaf field into a container', () => {
    const next = updateAtPath(makeTree(), [0, 0, 0], { label: 'X' });
    expect(next[0].fields[0].fields).toBeUndefined();
    expect(next[0].fields[0].label).toBe('Siła');
  });

  test('removeAtPath does not turn a leaf field into a container', () => {
    const next = removeAtPath(makeTree(), [0, 0, 0]);
    expect(next[0].fields[0].fields).toBeUndefined();
    expect(next[0].fields.map(f => f.key)).toEqual(['attr_1']);
  });
});

// ── Drop zones ───────────────────────────────────────────────────────────────
// A hovered SECTION has exactly two meanings, split by DOM element rather than by geometry:
// its header reorders it among its siblings, everything else about it accepts the dragged
// node inside. A hovered LEAF keeps its single meaning, "insert where that card sits".

describe('canDropInto', () => {
  test('accepts a section that is neither the dragged node nor inside it', () => {
    expect(canDropInto(makeTree(), [0, 0], [1, 1])).toBe(true);
    expect(canDropInto(makeTree(), [1, 0], [0])).toBe(true);
  });

  test('refuses the dragged node itself', () => {
    expect(canDropInto(makeTree(), [1, 1], [1, 1])).toBe(false);
  });

  test('refuses a descendant of the dragged node', () => {
    expect(canDropInto(makeTree(), [1, 1], [1, 1, 1])).toBe(false);
  });

  test('refuses a leaf field, which has no children to drop into', () => {
    expect(canDropInto(makeTree(), [1, 1], [0, 0])).toBe(false);
  });

  test('refuses only the direct parent, not grandparents and above', () => {
    // Structure: A holds B, B holds X.
    // - X into B (direct parent): refused, implicit gesture has fallback to "beside B"
    // - X into A (grandparent): accepted, moving a node up levels is a legitimate gesture
    const tree = [
      { id: 'sec_a', title: 'A', columns: 2, fields: [
        { key: 'sec_b', type: SECTION_TYPE, label: '', section: { id: 'sec_b', title: 'B', columns: 2, fields: [
          { key: 'fld_x', type: 'attr', label: 'X' },
        ] } },
      ] },
    ];
    // X is at [0, 0, 0], direct parent is B at [0, 0], grandparent is A at [0]
    expect(canDropInto(tree, [0, 0, 0], [0, 0])).toBe(false); // direct parent refused
    expect(canDropInto(tree, [0, 0, 0], [0])).toBe(true);     // grandparent accepted
  });

  test('cycle guards still refuse a section into itself or its own descendants', () => {
    // Even with the direct-parent-only refusal, the cycle guards (samePath and isAncestorPath)
    // must still prevent a section from containing itself.
    const tree = [
      { id: 'sec_root', title: 'Root', columns: 2, fields: [
        { key: 'sec_a', type: SECTION_TYPE, label: '', section: { id: 'sec_a', title: 'A', columns: 2, fields: [
          { key: 'sec_b', type: SECTION_TYPE, label: '', section: { id: 'sec_b', title: 'B', columns: 1, fields: [
            { key: 'fld_x', type: 'attr', label: 'X' },
          ] } },
        ] } },
      ] },
    ];
    // sec_a at [0, 0], sec_b at [0, 0, 0]
    expect(canDropInto(tree, [0, 0], [0, 0])).toBe(false);    // into itself
    expect(canDropInto(tree, [0, 0], [0, 0, 0])).toBe(false); // into its child sec_b
  });

  test('refuses a container the node is already inside, at any depth (direct parent only)', () => {
    // "Into" is a relocation, and relocating a node into its own direct parent would be
    // a pointless re-append. The parent's append sentinel is the explicit way to ask for
    // exactly that move. Higher ancestors are accepted to allow moving nodes up the tree.
    expect(canDropInto(makeTree(), [1, 0], [1])).toBe(false); // direct parent
  });

  test('refuses paths that address nothing', () => {
    expect(canDropInto(makeTree(), [0, 0], [9])).toBe(false);
    expect(canDropInto(makeTree(), [9], [0])).toBe(false);
    expect(canDropInto(makeTree(), [0, 0], [])).toBe(false);
  });
});

// dropIntent is the single interpretation of a hover, shared by the highlight and the drop so
// the two can never disagree about where the node would land. Nothing is written to the tree
// while the pointer moves any more — the intent is resolved once, at the drop.
describe('dropIntent', () => {
  // The user's case: one root section A holding a field X and an EMPTY subsection B as
  // siblings in the same ordered list. Hovering B used to mean "insert beside it", exactly
  // like hovering a plain field, so X could only enter B through its narrow append strip.
  const makeSiblingCase = () => ([
    { id: 'sec_a', title: 'A', columns: 3, fields: [
      { key: 'fld_x', type: 'attr', label: 'X' },
      { key: 'sec_b', type: SECTION_TYPE, label: '', section: { id: 'sec_b', title: 'B', columns: 2, fields: [] } },
    ] },
  ]);

  // apply is what the drag handler does at drop: resolve the intent, hand it to moveNode.
  const apply = (tree, fromPath, overId) => {
    const intent = dropIntent(tree, fromPath, overId);
    return intent ? moveNode(tree, fromPath, intent.parentPath, intent.idx) : tree;
  };

  test("hovering a subsection's body drops the field INSIDE it", () => {
    const next = apply(makeSiblingCase(), [0, 0], 'sec_b');
    expect(next[0].fields.map(f => f.key)).toEqual(['sec_b']);
    expect(next[0].fields[0].section.fields.map(f => f.key)).toEqual(['fld_x']);
  });

  test("hovering a subsection's HEADER places the field beside it, leaving it empty", () => {
    // The header keeps the ordinary sortable meaning: moveNode takes a POST-REMOVAL index, so
    // dragging X down onto B's slot lands it after B.
    const next = apply(makeSiblingCase(), [0, 0], dropHeaderId('sec_b'));
    expect(next[0].fields.map(f => f.key)).toEqual(['sec_b', 'fld_x']);
    expect(next[0].fields[0].section.fields).toEqual([]);
  });

  test('the highlight names the receiving section for into, and nothing for beside', () => {
    const tree = makeSiblingCase();
    expect(dropIntent(tree, [0, 0], 'sec_b').intoId).toBe('sec_b');
    expect(dropIntent(tree, [0, 0], dropHeaderId('sec_b')).intoId).toBeNull();
  });

  test('a nested subsection three levels down accepts a node the same way', () => {
    const next = apply(makeTree(), [0, 0], 'sec_d');
    expect(next[0].fields).toEqual([]);
    expect(next[1].fields[1].section.fields[1].section.fields.map(f => f.key)).toEqual(['txt_1', 'attr_1']);
  });

  test("a nested subsection's header reorders it among its own siblings", () => {
    // A header hover never gets besideId, even cross-list: it addresses a container, not a
    // field card, and keeps its plain sortable behaviour with no extra indicator.
    expect(dropIntent(makeTree(), [0, 0], dropHeaderId('sec_c')))
      .toEqual({ parentPath: [1], idx: 1, intoId: null, besideId: null });
    const next = apply(makeTree(), [0, 0], dropHeaderId('sec_c'));
    expect(next[1].fields.map(f => f.key)).toEqual(['num_1', 'attr_1', 'sec_c']);
  });

  test('a leaf field still means "insert where that card sits"', () => {
    // [0, 0] (attr_1) lives in sec_a, 'num_1' in sec_b — different lists, so besideId names
    // the hovered card too (see the dedicated besideId describe block below).
    expect(dropIntent(makeTree(), [0, 0], 'num_1'))
      .toEqual({ parentPath: [1], idx: 0, intoId: null, besideId: 'num_1' });
  });

  // ── besideId: the cross-list "insertion line" indicator ──
  describe('besideId', () => {
    test('hovering a field card in a DIFFERENT list than the dragged node names it', () => {
      // [0, 0] is attr_1 inside sec_a; 'num_1' lives inside sec_b — different lists.
      expect(dropIntent(makeTree(), [0, 0], 'num_1').besideId).toBe('num_1');
    });

    test('hovering a field card in the SAME list as the dragged node is null', () => {
      // dnd-kit's own sortable displacement already previews this case, so a second
      // indicator would be redundant. Two leaf fields, both direct children of one section.
      const sameListTree = [
        { id: 'sec_a', title: 'A', columns: 3, fields: [
          { key: 'fld_x', type: 'attr', label: 'X' },
          { key: 'fld_y', type: 'attr', label: 'Y' },
        ] },
      ];
      expect(dropIntent(sameListTree, [0, 0], 'fld_y').besideId).toBeNull();
    });

    test('a header hover never sets besideId, even across lists', () => {
      // [0, 0] (attr_1, in sec_a) hovering sec_c's header (nested in sec_b) is cross-list,
      // but the header form addresses a container, not a field card.
      expect(dropIntent(makeTree(), [0, 0], dropHeaderId('sec_c')).besideId).toBeNull();
    });
  });

  // ── refusals, so the highlight never promises a drop moveNode would refuse ──

  test('into the dragged node itself, or its own subtree, is no drop at all', () => {
    const tree = makeTree();
    expect(dropIntent(tree, [1, 1], 'sec_c')).toBeNull();          // itself
    expect(dropIntent(tree, [1, 1], 'sec_d')).toBeNull();          // its own child
    expect(dropIntent(tree, [1, 1], dropSentinelId('sec_d'))).toBeNull();
    expect(dropIntent(tree, [1, 1], dropHeaderId('sec_c'))).toBeNull(); // beside itself
  });

  test('dropping into a grandparent (or higher ancestor) moves the node up the tree', () => {
    // Structure: A holds B, B holds X. Dragging X to A's body droppable should move X
    // out of B and into A.
    const tree = [
      { id: 'sec_a', title: 'A', columns: 2, fields: [
        { key: 'sec_b', type: SECTION_TYPE, label: '', section: { id: 'sec_b', title: 'B', columns: 2, fields: [
          { key: 'fld_x', type: 'attr', label: 'X' },
        ] } },
      ] },
    ];
    const intent = dropIntent(tree, [0, 0, 0], 'sec_a');
    expect(intent).toEqual({ parentPath: [0], idx: -1, intoId: 'sec_a', besideId: null });
    // Verify the move actually works
    const next = moveNode(tree, [0, 0, 0], intent.parentPath, intent.idx);
    expect(next[0].fields.map(f => f.key)).toEqual(['sec_b', 'fld_x']);
    expect(next[0].fields[0].section.fields).toEqual([]);
  });

  test('a container the node already sits in falls back to "beside that container"', () => {
    // canDropInto refuses only the direct parent, so the hover reads as the plain sortable
    // meaning instead of offering a relocation that would re-append the node in its own list.
    // [1, 0] is num_1 directly inside sec_b, so sec_b is the direct parent.
    expect(dropIntent(makeTree(), [1, 0], 'sec_b'))
      .toEqual({ parentPath: [], idx: 1, intoId: null, besideId: null });
  });

  test('the append sentinel stays the explicit way to move a node to the end of its own list', () => {
    // The sentinel is a deliberate gesture, not something the pointer brushes past, so it
    // keeps working where the implicit body hover falls back.
    const intent = dropIntent(makeTree(), [1, 0], dropSentinelId('sec_b'));
    expect(intent).toEqual({ parentPath: [1], idx: -1, intoId: 'sec_b', besideId: null });
    expect(apply(makeTree(), [1, 0], dropSentinelId('sec_b'))[1].fields.map(f => f.key))
      .toEqual(['sec_c', 'num_1']);
  });

  test('an unknown id, or an unusable source path, is no drop', () => {
    const tree = makeTree();
    expect(dropIntent(tree, [0, 0], 'nope')).toBeNull();
    expect(dropIntent(tree, null, 'sec_b')).toBeNull();
  });

  test('resolving a hover leaves a deep-frozen tree untouched', () => {
    const tree = makeTree();
    const freeze = (v) => {
      if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(freeze); }
      return v;
    };
    freeze(tree);
    expect(() => dropIntent(tree, [0, 0], 'sec_c')).not.toThrow();
    expect(() => apply(tree, [0, 0], dropHeaderId('sec_c'))).not.toThrow();
    expect(tree[1].fields.map(f => f.key)).toEqual(['num_1', 'sec_c']);
  });
});

describe('purity', () => {
  const deepFreeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(deepFreeze);
    }
    return value;
  };

  // Test files run as ES modules, so they are strict mode: writing to a frozen object throws
  // instead of failing silently. duplicateNodeAtPath is the case worth pinning — it deep-clones
  // and then mutates the clone in place to append the copy suffix, so a future edit that moved
  // that mutation one line earlier would start writing into the caller's own tree.
  test('insert, remove, move and duplicate all leave a deep-frozen tree untouched', () => {
    const tree = deepFreeze(makeTree());
    expect(() => insertAtPath(tree, [1, 1], 1, { key: 'new_1', type: 'checkbox' })).not.toThrow();
    expect(() => removeAtPath(tree, [1, 1])).not.toThrow();
    expect(() => moveNode(tree, [0, 0], [1, 1, 1], 0)).not.toThrow();
    expect(() => moveNode(tree, [1, 0], [1], 1)).not.toThrow();
    expect(() => moveNode(tree, [1, 1], [], 0)).not.toThrow();
    expect(() => duplicateNodeAtPath(tree, [1, 1], { mint, copySuffix: '(kopia)' })).not.toThrow();
    expect(() => duplicateNodeAtPath(tree, [0, 0], { mint, copySuffix: '(kopia)' })).not.toThrow();
    expect(() => duplicateNodeAtPath(tree, [0], { mint, copySuffix: '(kopia)' })).not.toThrow();

    // And the fixture still reads exactly as it was built.
    expect(tree[0].fields.map(f => f.key)).toEqual(['attr_1']);
    expect(tree[1].fields.map(f => f.key)).toEqual(['num_1', 'sec_c']);
    expect(tree[1].fields[1].section.title).toBe('C');
    expect(tree[1].fields[1].section.fields[1].section.fields[0].key).toBe('txt_1');
  });
});
