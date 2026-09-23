import {
  buildDragEntries, resolveDrop, ghostRectForDrop, editingPathAfterMove, editingPathAfterRemove,
} from './TemplateBuilder';

// TemplateBuilder pulls in api/axios AND, through the system registry, axios itself — the ESM
// import jest cannot parse. Mocking the instance is enough to import the module (see
// TemplateBuilder.chromeWiring.test.jsx, which needs the same mock to mount the component).
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

// jsdom cannot drive a real pointer drag (no window.PointerEvent, no layout, no
// document.elementFromPoint), so handleDragStart/handleDragMove — the DOM plumbing that produces
// a `target` from a pointer position — cannot be exercised here. What CAN be tested honestly is
// the drag-end DECISION: given a tree, where a node started and the target insertionAt would have
// computed, does the right moveNode call come out, and does the properties popup follow the
// node it was showing. Both are pulled out of TemplateBuilder as plain functions for exactly
// this reason.
const tree = [
  { id: 'sec_a', title: 'A', columns: 2, fields: [
    { key: 'f_a', type: 'text_short', label: 'Alpha' },
    { key: 'f_b', type: 'text_short', label: 'Beta' },
    { key: 'f_c', type: 'text_short', label: 'Gamma' },
  ] },
  { id: 'sec_b', title: 'B', columns: 1, fields: [
    { key: 'sub', type: 'section', label: '', section: { id: 'sub', title: 'Sub', columns: 1, fields: [
      { key: 'f_d', type: 'text_short', label: 'Delta' },
    ] } },
  ] },
];

describe('buildDragEntries', () => {
  test('prepends the root container entry when rootEl is present', () => {
    const rootEl = { className: 'custom-sheet__sections' };
    const nodeEntries = [
      { path: [0], container: false, el: document.createElement('div') },
      { path: [1], container: true, el: document.createElement('div') },
    ];
    const result = buildDragEntries(rootEl, nodeEntries);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ path: [], container: true, el: rootEl });
    expect(result[1]).toBe(nodeEntries[0]);
    expect(result[2]).toBe(nodeEntries[1]);
  });

  test('omits the root entry when rootEl is null', () => {
    const nodeEntries = [
      { path: [0], container: false, el: document.createElement('div') },
      { path: [1], container: true, el: document.createElement('div') },
    ];
    const result = buildDragEntries(null, nodeEntries);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(nodeEntries[0]);
    expect(result[1]).toBe(nodeEntries[1]);
  });

  test('passes through node entries untouched', () => {
    const rootEl = { className: 'custom-sheet__sections' };
    const nodeEntries = [
      { path: [0], container: false, el: 'el0' },
      { path: [0, 0], container: false, el: 'el00' },
      { path: [1], container: true, el: 'el1' },
    ];
    const result = buildDragEntries(rootEl, nodeEntries);
    expect(result.slice(1)).toEqual(nodeEntries);
  });
});

describe('resolveDrop', () => {
  test('allows reordering within the same section', () => {
    // f_a (path [0,0]) dropped beside f_c: insertionAt would report {parentPath:[0], index:2}
    // (the visual index, counting f_a still in the list).
    const target = { parentPath: [0], index: 2 };
    expect(resolveDrop(tree, [0, 0], target)).toEqual({ toParentPath: [0], toIndex: 1 });
  });

  test('allows dropping into a different container', () => {
    // f_a moved into "sub", the nested (empty-of-f_a) section.
    const target = { parentPath: [1, 0], index: 0 };
    expect(resolveDrop(tree, [0, 0], target)).toEqual({ toParentPath: [1, 0], toIndex: 0 });
  });

  test('refuses a node dropped into itself', () => {
    // "sub" (path [1,0]) hovered over its own interior grid.
    const target = { parentPath: [1, 0], index: 0 };
    expect(resolveDrop(tree, [1, 0], target)).toBeNull();
  });

  test('refuses a node dropped into its own descendant', () => {
    // sec_b (path [1]) dropped into "sub"'s interior — sub is sec_b's own child.
    const target = { parentPath: [1, 0], index: 0 };
    expect(resolveDrop(tree, [1], target)).toBeNull();
  });

  test('a refused drop changes nothing — there is no tree mutation to make', () => {
    const target = { parentPath: [1, 0], index: 0 };
    const before = tree;
    resolveDrop(tree, [1, 0], target);
    // resolveDrop is pure: it never touches the tree it was given.
    expect(tree).toBe(before);
  });

  test('a null target (pointer outside every rect) is always refused', () => {
    expect(resolveDrop(tree, [0, 0], null)).toBeNull();
  });

  test('a section dropped between two root sections moves to the top level', () => {
    // parentPath [] is only reachable once the root list is registered as a container.
    // "sub" (path [1,0]) dropped at root index 1 (between sec_a and sec_b) becomes a root
    // section. fromPath's own parent ([1]) differs from the target's ([]), so this exercises
    // the cross-boundary move, not the same-list reorder bypass.
    const target = { parentPath: [], index: 1 };
    expect(resolveDrop(tree, [1, 0], target)).toEqual({ toParentPath: [], toIndex: 1 });
  });

  test('a leaf field dropped at root is refused', () => {
    // moveNode would return the tree unchanged; resolveDrop must say no outright, so the caller
    // never commits a no-op and the ghost never promises a drop that cannot happen.
    const target = { parentPath: [], index: 1 };
    expect(resolveDrop(tree, [0, 0], target)).toBeNull();
  });

  test('root sections reorder among themselves', () => {
    // sec_a (path [0]) dropped after sec_b: insertionAt would report the visual index 2
    // (counting sec_a still in the root list).
    const target = { parentPath: [], index: 2 };
    expect(resolveDrop(tree, [0], target)).toEqual({ toParentPath: [], toIndex: 1 });
  });
});

describe('ghostRectForDrop', () => {
  // Geometry for the same shape sheetDnd.test.js uses for ghostRectFor: one container at [0]
  // with two fields side by side.
  const rectNodes = [
    { path: [0],    rect: { left: 0, top: 0, width: 300, height: 100 }, container: true },
    { path: [0, 0], rect: { left: 10, top: 20, width: 80, height: 40 }, container: false },
    { path: [0, 1], rect: { left: 98, top: 20, width: 80, height: 40 }, container: false },
  ];
  const draggedRect = { left: 0, top: 0, width: 80, height: 120 };

  test('draws the ghost when resolveDrop accepts the target', () => {
    // f_a (path [0,0]) dropped beside f_b: an ordinary same-section reorder, allowed.
    const target = { parentPath: [0], index: 1 };
    const decision = resolveDrop(tree, [0, 0], target);
    expect(decision).not.toBeNull();
    expect(ghostRectForDrop(decision, target, draggedRect, rectNodes))
      .toEqual({ top: 20, left: 98, width: 80, height: 120 });
  });

  test('draws no ghost for a target resolveDrop refuses', () => {
    // A leaf field dropped at root: resolveDrop refuses it outright (see the resolveDrop suite
    // above). The ghost must not promise a landing spot that would then do nothing on release.
    const target = { parentPath: [], index: 1 };
    const decision = resolveDrop(tree, [0, 0], target);
    expect(decision).toBeNull();
    expect(ghostRectForDrop(decision, target, draggedRect, rectNodes)).toBeNull();
  });
});

describe('editingPathAfterMove', () => {
  test('follows the dragged node itself', () => {
    expect(editingPathAfterMove([0, 0], [0, 0], [0, 2])).toEqual([0, 2]);
  });

  test('follows a descendant of the dragged node', () => {
    // "sub" (path [1,0]) moved to [0,3]; a field edited inside it (was [1,0,0]) must move with it.
    expect(editingPathAfterMove([1, 0, 0], [1, 0], [0, 3])).toEqual([0, 3, 0]);
  });

  test('leaves an unrelated editingPath alone', () => {
    expect(editingPathAfterMove([0, 1], [1, 0], [0, 3])).toEqual([0, 1]);
  });

  test('leaves a null editingPath alone', () => {
    expect(editingPathAfterMove(null, [0, 0], [0, 2])).toBeNull();
  });

  test('does nothing when the move itself was refused (no new path)', () => {
    expect(editingPathAfterMove([0, 0], [0, 0], null)).toEqual([0, 0]);
  });
});

describe('editingPathAfterRemove', () => {
  test('closes the popup when the edited node is the one removed', () => {
    expect(editingPathAfterRemove([0, 1], [0, 1])).toBeNull();
  });

  test('closes the popup when the edited node sits inside the removed subtree', () => {
    // "sub" (path [1,0]) removed; a field edited inside it (was [1,0,0]) has nothing left.
    expect(editingPathAfterRemove([1, 0, 0], [1, 0])).toBeNull();
  });

  test('shifts down when an earlier sibling in the same list was removed', () => {
    expect(editingPathAfterRemove([0, 2], [0, 0])).toEqual([0, 1]);
  });

  test('leaves the path unchanged when a later sibling was removed', () => {
    expect(editingPathAfterRemove([0, 0], [0, 2])).toEqual([0, 0]);
  });

  test('leaves the path unchanged when an unrelated branch was removed', () => {
    expect(editingPathAfterRemove([0, 1], [1, 0])).toEqual([0, 1]);
  });

  test('leaves a null editingPath alone', () => {
    expect(editingPathAfterRemove(null, [0, 0])).toBeNull();
  });
});
