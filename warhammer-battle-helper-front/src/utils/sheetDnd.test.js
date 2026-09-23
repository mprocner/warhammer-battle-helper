import { insertionAt, toMoveArgs, GAP, ghostRectFor, measureNodes } from './sheetDnd';

// Rect helper: sheet coordinates are viewport coordinates, y grows downwards.
const r = (left, top, width, height) => ({ left, top, width, height });

// One root section (container) at 0, holding three fields side by side in one row.
const rowTree = () => ([
  { path: [0],    rect: r(0, 0, 300, 100), container: true },
  { path: [0, 0], rect: r(10, 20, 80, 40), container: false },
  { path: [0, 1], rect: r(98, 20, 80, 40), container: false },
  { path: [0, 2], rect: r(186, 20, 80, 40), container: false },
]);

// One root section holding two stacked fields (single column).
const columnTree = () => ([
  { path: [0],    rect: r(0, 0, 300, 200), container: true },
  { path: [0, 0], rect: r(10, 20, 280, 40), container: false },
  { path: [0, 1], rect: r(10, 68, 280, 40), container: false },
]);

describe('insertionAt — horizontal axis (fields in one row)', () => {
  test('pointer left of a field centre inserts before it', () => {
    expect(insertionAt({ x: 110, y: 40 }, rowTree()))
      .toEqual({ parentPath: [0], index: 1 });
  });

  test('pointer right of a field centre inserts after it', () => {
    expect(insertionAt({ x: 170, y: 40 }, rowTree()))
      .toEqual({ parentPath: [0], index: 2 });
  });

  test('pointer past the last field inserts at the end', () => {
    expect(insertionAt({ x: 260, y: 40 }, rowTree()))
      .toEqual({ parentPath: [0], index: 3 });
  });
});

describe('insertionAt — vertical axis (stacked fields)', () => {
  test('pointer above a field centre inserts before it', () => {
    expect(insertionAt({ x: 100, y: 30 }, columnTree()))
      .toEqual({ parentPath: [0], index: 0 });
  });

  test('pointer below a field centre inserts after it', () => {
    expect(insertionAt({ x: 100, y: 55 }, columnTree()))
      .toEqual({ parentPath: [0], index: 1 });
  });
});

describe('insertionAt — containers', () => {
  test('pointer inside a section but over no child appends to that section', () => {
    expect(insertionAt({ x: 150, y: 90 }, rowTree()))
      .toEqual({ parentPath: [0], index: 3 });
  });

  test('an empty section accepts the first child', () => {
    const nodes = [{ path: [0], rect: r(0, 0, 300, 100), container: true }];
    expect(insertionAt({ x: 150, y: 50 }, nodes))
      .toEqual({ parentPath: [0], index: 0 });
  });

  test('the deepest container under the pointer wins', () => {
    const nodes = [
      { path: [0],       rect: r(0, 0, 300, 200), container: true },
      { path: [0, 0],    rect: r(10, 20, 280, 120), container: true },
      { path: [0, 0, 0], rect: r(20, 30, 100, 40), container: false },
    ];
    // Inside the nested section, below its only child.
    expect(insertionAt({ x: 150, y: 120 }, nodes))
      .toEqual({ parentPath: [0, 0], index: 1 });
  });

  test('pointer outside every node returns null', () => {
    expect(insertionAt({ x: 900, y: 900 }, rowTree())).toBeNull();
  });
});

describe('toMoveArgs — post-removal index', () => {
  test('moving forward inside the same list shifts the index down by one', () => {
    expect(toMoveArgs([0, 0], { parentPath: [0], index: 2 }))
      .toEqual({ toParentPath: [0], toIndex: 1 });
  });

  test('moving backward inside the same list keeps the index', () => {
    expect(toMoveArgs([0, 2], { parentPath: [0], index: 1 }))
      .toEqual({ toParentPath: [0], toIndex: 1 });
  });

  test('dropping into a different list keeps the index', () => {
    expect(toMoveArgs([0, 0], { parentPath: [1], index: 2 }))
      .toEqual({ toParentPath: [1], toIndex: 2 });
  });

  test('dropping onto its own position is a no-op index', () => {
    expect(toMoveArgs([0, 1], { parentPath: [0], index: 1 }))
      .toEqual({ toParentPath: [0], toIndex: 1 });
  });
});

describe('GAP', () => {
  test('matches the sheet grid gap in style.css', () => {
    expect(GAP).toBe(8);
  });
});

// A 2-column grid that wraps: field0/field1 share row 1, field2 starts row 2. field1 is the last
// cell of its row, which is where the neighbour-picking bug lived.
const wrappedTree = () => ([
  { path: [0],    rect: r(0, 0, 200, 200), container: true },
  { path: [0, 0], rect: r(10, 20, 80, 40), container: false },
  { path: [0, 1], rect: r(98, 20, 80, 40), container: false },
  { path: [0, 2], rect: r(10, 68, 80, 40), container: false },
]);

describe('insertionAt — axis in a wrapped grid', () => {
  test('the last cell of a row is still judged horizontally, whatever the pointer y', () => {
    // x is right of field1's centre (138) in both, so the answer must be "after field1" twice.
    expect(insertionAt({ x: 170, y: 25 }, wrappedTree())).toEqual({ parentPath: [0], index: 2 });
    expect(insertionAt({ x: 170, y: 55 }, wrappedTree())).toEqual({ parentPath: [0], index: 2 });
  });

  test('left of the last cell of a row inserts before it', () => {
    expect(insertionAt({ x: 110, y: 40 }, wrappedTree())).toEqual({ parentPath: [0], index: 1 });
  });
});

describe('insertionAt — axis with no row-mate', () => {
  test('a lone cell in a container wide enough for another is judged horizontally', () => {
    const nodes = [
      { path: [0],    rect: r(0, 0, 300, 100), container: true },
      { path: [0, 0], rect: r(10, 20, 88, 40), container: false },
    ];
    // Right of the cell's centre (54) but ABOVE its middle (40): only a horizontal reading gives
    // "after".
    expect(insertionAt({ x: 90, y: 25 }, nodes)).toEqual({ parentPath: [0], index: 1 });
    expect(insertionAt({ x: 20, y: 55 }, nodes)).toEqual({ parentPath: [0], index: 0 });
  });

  test('a lone cell filling its container is judged vertically', () => {
    const nodes = [
      { path: [0],    rect: r(0, 0, 300, 100), container: true },
      { path: [0, 0], rect: r(10, 20, 280, 40), container: false },
    ];
    expect(insertionAt({ x: 250, y: 25 }, nodes)).toEqual({ parentPath: [0], index: 0 });
    expect(insertionAt({ x: 20, y: 55 }, nodes)).toEqual({ parentPath: [0], index: 1 });
  });
});

describe('insertionAt — pointer over no cell', () => {
  test('in the gap between two cells it inserts between them, not at the end', () => {
    // x = 94 sits in the 8px gap between field0 (ends 90) and field1 (starts 98).
    expect(insertionAt({ x: 94, y: 40 }, rowTree())).toEqual({ parentPath: [0], index: 1 });
  });

  test('between two rows it goes before the first cell of the row below', () => {
    // y = 64 is between row 1 (ends 60) and row 2 (starts 68).
    expect(insertionAt({ x: 150, y: 64 }, wrappedTree())).toEqual({ parentPath: [0], index: 2 });
  });

  test('above the first row it goes to the front', () => {
    expect(insertionAt({ x: 150, y: 10 }, wrappedTree())).toEqual({ parentPath: [0], index: 0 });
  });

  test('below every row it still appends', () => {
    expect(insertionAt({ x: 150, y: 150 }, wrappedTree())).toEqual({ parentPath: [0], index: 3 });
  });
});

describe('insertionAt — sub-pixel row alignment', () => {
  // Real rects are floats: getBoundingClientRect returns fractions and minmax(0, 1fr) column
  // widths rarely divide evenly, so row-mates differ in `top` by fractions of a pixel. Both
  // fixtures below are built so that matching rows by exact equality gives a DIFFERENT answer
  // from matching them by tolerance — an earlier attempt used a fixture where other rules
  // happened to reach the right answer anyway, which proved nothing.

  // Two wide cells side by side, drifted by 0.4px. They are wide enough that a third cell of the
  // same width would NOT fit beside cell1, so isRowLayout's container-width fallback answers
  // "vertical" — meaning the row-mate check is the ONLY thing that can get the axis right.
  const wideDriftedRow = () => ([
    { path: [0],    rect: r(0, 0, 320, 100), container: true },
    { path: [0, 0], rect: { left: 10,  top: 20.4, width: 145, height: 40 }, container: false },
    { path: [0, 1], rect: { left: 163, top: 20.0, width: 145, height: 40 }, container: false },
  ]);

  test('a drifted row-mate still settles the axis, overriding the width fallback', () => {
    // Pointer is inside cell1, LEFT of its centre (235.5) but BELOW its middle (40).
    // Horizontal (correct) reads x and says "before cell1" → 1.
    // Vertical (what exact equality produced) reads y and says "after cell1" → 2.
    expect(insertionAt({ x: 200, y: 55 }, wideDriftedRow())).toEqual({ parentPath: [0], index: 1 });
  });

  // Three cells in one row, tops drifted by fractions. Their [top, bottom] bands end at 60.4,
  // 60.0 and 60.2, so a pointer at y = 60.35 falls inside cell0's band only.
  const driftedRow = () => ([
    { path: [0],    rect: r(0, 0, 300, 100), container: true },
    { path: [0, 0], rect: { left: 10,  top: 20.4, width: 80, height: 40 }, container: false },
    { path: [0, 1], rect: { left: 98,  top: 20.0, width: 80, height: 40 }, container: false },
    { path: [0, 2], rect: { left: 186, top: 20.2, width: 80, height: 40 }, container: false },
  ]);

  test('a pointer below a drifted row is measured against the whole row, not one stray cell', () => {
    // Over no cell (y is past cell1 and cell2, x is past cell0), so this is the container branch.
    // With exact equality the three cells form three one-item rows and only cell0's band reaches
    // y = 60.35, so the pointer is measured against cell0 alone: x 200 > centre 50 → index 1.
    // With tolerance they are one row, and the nearest cell to x = 200 is cell2 (centre 226),
    // with the pointer to its left → index 2.
    expect(insertionAt({ x: 200, y: 60.35 }, driftedRow())).toEqual({ parentPath: [0], index: 2 });
  });
});

describe('ghostRectFor', () => {
  const nodes = [
    { path: [0],    rect: r(0, 0, 300, 100), container: true },
    { path: [0, 0], rect: r(10, 20, 80, 40), container: false },
    { path: [0, 1], rect: r(98, 20, 80, 40), container: false },
  ];
  const dragged = r(0, 0, 80, 120);

  test('takes the column position and width of the field it displaces, and the dragged height', () => {
    expect(ghostRectFor({ parentPath: [0], index: 1 }, dragged, nodes))
      .toEqual({ top: 20, left: 98, width: 80, height: 120 });
  });

  test('appending where the row still has space places the ghost beside the last field', () => {
    expect(ghostRectFor({ parentPath: [0], index: 2 }, dragged, nodes))
      .toEqual({ top: 20, left: 98 + 80 + GAP, width: 80, height: 120 });
  });

  test('appending where the row is full places the ghost on the next line', () => {
    const full = [
      { path: [0],    rect: r(0, 0, 180, 100), container: true },
      { path: [0, 0], rect: r(10, 20, 80, 40), container: false },
      { path: [0, 1], rect: r(98, 20, 80, 40), container: false },
    ];
    expect(ghostRectFor({ parentPath: [0], index: 2 }, dragged, full))
      .toEqual({ top: 20 + 40 + GAP, left: 10, width: 80, height: 120 });
  });

  test('an empty container gets a ghost the width of the container', () => {
    const empty = [{ path: [0], rect: r(0, 0, 300, 100), container: true }];
    expect(ghostRectFor({ parentPath: [0], index: 0 }, dragged, empty))
      .toEqual({ top: 0, left: 0, width: 300, height: 120 });
  });

  test('an unknown target returns null', () => {
    expect(ghostRectFor({ parentPath: [9], index: 0 }, dragged, nodes)).toBeNull();
  });

  test('takes its width from the destination column and its height from the dragged node', () => {
    // Distinct numbers throughout: dragged 120x150 against neighbours of 80 width and 40 height.
    // A ghost that took the dragged node's width, or the neighbour's height, would show here —
    // with every fixture at width 80 the two readings were indistinguishable.
    const wide = { left: 0, top: 0, width: 120, height: 150 };
    expect(ghostRectFor({ parentPath: [0], index: 1 }, wide, nodes))
      .toEqual({ top: 20, left: 98, width: 80, height: 150 });
  });

  test('the appended ghost also takes the column width, not the dragged width', () => {
    const wide = { left: 0, top: 0, width: 120, height: 150 };
    // Row-fit is judged on the destination column's width too: 98 + 80 + GAP + 80 = 266 <= 300,
    // so this continues the row rather than starting a new line.
    expect(ghostRectFor({ parentPath: [0], index: 2 }, wide, nodes))
      .toEqual({ top: 20, left: 98 + 80 + GAP, width: 80, height: 150 });
  });
});

describe('measureNodes', () => {
  test('reads each element rect once and keeps path and container flag', () => {
    const el = (rect) => ({ getBoundingClientRect: () => rect });
    const out = measureNodes([
      { path: [0], container: true, el: el(r(0, 0, 300, 100)) },
      { path: [0, 0], container: false, el: el(r(10, 20, 80, 40)) },
    ]);
    expect(out).toEqual([
      { path: [0], container: true, rect: r(0, 0, 300, 100) },
      { path: [0, 0], container: false, rect: r(10, 20, 80, 40) },
    ]);
  });

  test('skips entries whose element is gone', () => {
    expect(measureNodes([{ path: [0], container: true, el: null }])).toEqual([]);
  });
});
