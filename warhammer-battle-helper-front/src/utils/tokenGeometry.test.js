import {
  rectPx,
  cellRectFromPx,
  centerOf,
  cellsOf,
  snapToGrid,
  distanceBetween,
  formatDistance,
  snapPointToTokens,
  characterToMapToken,
  imageToMapToken,
  rectsIntersect,
  unionRect,
  selectTokensInRect,
  clampGroupDelta,
  clampToWorkspace,
  clampSizeToWorkspace,
} from './tokenGeometry';

// CELL_SIZE is 50 (constants/scene.js).

describe('rectPx / cellRectFromPx', () => {
  it('converts a cell rect to pixels', () => {
    expect(rectPx({ col: 2, row: 3, w: 1, h: 1 })).toEqual({ x: 100, y: 150, width: 50, height: 50 });
  });

  it('converts pixels back to a cell rect', () => {
    expect(cellRectFromPx({ x: 100, y: 150, width: 100, height: 50 })).toEqual({
      col: 2,
      row: 3,
      w: 2,
      h: 1,
    });
  });

  it('round-trips through both conversions', () => {
    const rect = { col: 1.5, row: 4.2, w: 2, h: 3 };
    expect(cellRectFromPx(rectPx(rect))).toEqual(rect);
  });
});

describe('centerOf', () => {
  it('returns the center of a 1x1 token', () => {
    expect(centerOf({ col: 2, row: 2, w: 1, h: 1 })).toEqual({ col: 2.5, row: 2.5 });
  });

  it('returns the center of a 2x2 token', () => {
    expect(centerOf({ col: 4, row: 4, w: 2, h: 2 })).toEqual({ col: 5, row: 5 });
  });
});

describe('cellsOf', () => {
  it('returns the single cell of a 1x1 token', () => {
    expect(cellsOf({ col: 3, row: 1, w: 1, h: 1 })).toEqual([{ col: 3, row: 1 }]);
  });

  it('returns all four cells of a 2x2 token', () => {
    expect(cellsOf({ col: 0, row: 0, w: 2, h: 2 })).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ]);
  });

  it('rounds fractional positions and clamps size to at least 1', () => {
    expect(cellsOf({ col: 2.4, row: 1.6, w: 0.3, h: 0 })).toEqual([{ col: 2, row: 2 }]);
  });
});

describe('snapToGrid', () => {
  it('rounds position to the nearest cell', () => {
    expect(snapToGrid({ col: 2.4, row: 3.6, w: 1, h: 1 })).toEqual({ col: 2, row: 4, w: 1, h: 1 });
  });

  it('clamps size to a minimum of 1 cell', () => {
    expect(snapToGrid({ col: 0, row: 0, w: 0.2, h: 0 })).toEqual({ col: 0, row: 0, w: 1, h: 1 });
  });
});

describe('distanceBetween', () => {
  const a = { col: 0, row: 0, w: 1, h: 1 }; // center (0.5, 0.5)
  const b = { col: 3, row: 4, w: 1, h: 1 }; // center (3.5, 4.5) → dx=3, dy=4

  it('euclidean is the straight-line distance between centers', () => {
    expect(distanceBetween(a, b, 'euclidean')).toBe(5); // 3-4-5 triangle
  });

  it('defaults to euclidean', () => {
    expect(distanceBetween(a, b)).toBe(5);
  });

  it('chebyshev is the larger axis delta', () => {
    expect(distanceBetween(a, b, 'chebyshev')).toBe(4);
  });

  it('alternating (5-10-5) charges every second diagonal double', () => {
    // dx=3, dy=4 → diag=3, straight=1 → 1 + 3 + floor(3/2)=1 = 5
    expect(distanceBetween(a, b, 'alternating')).toBe(5);
    // pure diagonal 2x2: diag=2, straight=0 → 0 + 2 + 1 = 3
    const c = { col: 0, row: 0, w: 1, h: 1 };
    const d = { col: 2, row: 2, w: 1, h: 1 };
    expect(distanceBetween(c, d, 'alternating')).toBe(3);
  });

  it('measures large tokens center-to-center', () => {
    const big = { col: 0, row: 0, w: 2, h: 2 }; // center (1, 1)
    const small = { col: 4, row: 1, w: 1, h: 1 }; // center (4.5, 1.5) → dx=3.5, dy=0.5
    expect(distanceBetween(big, small, 'chebyshev')).toBe(3.5);
  });
});

describe('formatDistance', () => {
  it('scales the cell count by the cell size and appends the unit', () => {
    expect(formatDistance(3, 5, 'ft')).toBe('15 ft');
    expect(formatDistance(2, 1.5, 'm')).toBe('3 m');
  });

  it('rounds to one decimal', () => {
    expect(formatDistance(7.34, 1, 'in')).toBe('7.3 in');
  });

  it('omits the unit when none is given', () => {
    expect(formatDistance(4, 1)).toBe('4');
  });
});

describe('snapPointToTokens', () => {
  const targets = [
    { col: 2, row: 2, radius: 0.5 }, // 1x1 token center
    { col: 6, row: 6, radius: 1 },   // 2x2 token center
  ];

  it('snaps to a token center when within its radius', () => {
    expect(snapPointToTokens({ col: 2.3, row: 1.8 }, targets)).toEqual({ col: 2, row: 2 });
  });

  it('returns the original point when no token is close enough', () => {
    const p = { col: 4, row: 4 };
    expect(snapPointToTokens(p, targets)).toBe(p);
  });

  it('picks the nearest eligible token center', () => {
    expect(snapPointToTokens({ col: 5.6, row: 6 }, targets)).toEqual({ col: 6, row: 6 });
  });
});

describe('characterToMapToken', () => {
  it('adapts a GameCharacter into a MapToken', () => {
    const gc = { characterId: 'abc', positionX: 2, positionY: 3, w: 2, h: 2, zIndex: 5 };
    expect(characterToMapToken(gc)).toMatchObject({
      id: 'abc',
      kind: 'character',
      col: 2,
      row: 3,
      w: 2,
      h: 2,
      rotation: 0,
      zIndex: 5,
      locked: false,
    });
  });

  it('falls back to 1x1 for pre-w/h documents (zero value)', () => {
    const gc = { characterId: 'x', positionX: 0, positionY: 0, w: 0, h: 0 };
    const tok = characterToMapToken(gc);
    expect(tok.w).toBe(1);
    expect(tok.h).toBe(1);
  });

  it('keeps the raw document for delegation', () => {
    const gc = { characterId: 'x', positionX: 1, positionY: 1 };
    expect(characterToMapToken(gc).raw).toBe(gc);
  });
});

describe('imageToMapToken', () => {
  it('adapts a SceneImage (pixels) into a MapToken (cells)', () => {
    const img = { id: 'img1', x: 100, y: 50, width: 100, height: 50, rotation: 45, zIndex: 3, locked: true };
    expect(imageToMapToken(img)).toMatchObject({
      id: 'img1',
      kind: 'image',
      col: 2,
      row: 1,
      w: 2,
      h: 1,
      rotation: 45,
      zIndex: 3,
      locked: true,
    });
  });
});

describe('rectsIntersect', () => {
  const a = { col: 0, row: 0, w: 2, h: 2 };
  it('true for partial overlap', () => {
    expect(rectsIntersect(a, { col: 1, row: 1, w: 2, h: 2 })).toBe(true);
  });
  it('false when fully apart', () => {
    expect(rectsIntersect(a, { col: 5, row: 5, w: 1, h: 1 })).toBe(false);
  });
  it('false on edge touch only', () => {
    expect(rectsIntersect(a, { col: 2, row: 0, w: 1, h: 1 })).toBe(false);
  });
  it('true when one contains the other', () => {
    expect(rectsIntersect(a, { col: 0.5, row: 0.5, w: 0.5, h: 0.5 })).toBe(true);
  });
});

describe('unionRect', () => {
  it('returns null for empty', () => {
    expect(unionRect([])).toBeNull();
  });
  it('wraps two rects', () => {
    expect(unionRect([
      { col: 1, row: 1, w: 1, h: 1 },
      { col: 3, row: 2, w: 2, h: 2 },
    ])).toEqual({ col: 1, row: 1, w: 4, h: 3 });
  });
});

describe('selectTokensInRect', () => {
  const candidates = [
    { kind: 'image', id: 'a', rect: { col: 0, row: 0, w: 1, h: 1 } },
    { kind: 'char', id: 'b', rect: { col: 5, row: 5, w: 1, h: 1 } },
    { kind: 'image', id: 'c', rect: { col: 0.5, row: 0.5, w: 2, h: 2 } },
  ];
  it('returns only intersecting tokens', () => {
    expect(selectTokensInRect({ col: 0, row: 0, w: 1, h: 1 }, candidates)).toEqual([
      { kind: 'image', id: 'a' },
      { kind: 'image', id: 'c' },
    ]);
  });
  it('empty when nothing intersects', () => {
    expect(selectTokensInRect({ col: 20, row: 20, w: 1, h: 1 }, candidates)).toEqual([]);
  });
});

describe('clampGroupDelta', () => {
  const GRID = 10;
  const MARGIN = 100; // OFFSCENE_MARGIN_CELLS

  it('keeps a character-only group inside the grid', () => {
    const charBbox = { col: 0, row: 0, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: -5, dRow: -5 }, { charBbox, imageBbox: null }, GRID, GRID))
      .toEqual({ dCol: 0, dRow: 0 });
  });

  it('lets an image-only group travel into the margin', () => {
    const imageBbox = { col: 0, row: 0, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: -5, dRow: -5 }, { charBbox: null, imageBbox }, GRID, GRID))
      .toEqual({ dCol: -5, dRow: -5 });
  });

  it('clamps an image-only group at the far edge of the margin', () => {
    const imageBbox = { col: 0, row: 0, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: -999, dRow: 0 }, { charBbox: null, imageBbox }, GRID, GRID))
      .toEqual({ dCol: -MARGIN, dRow: 0 });
  });

  it('applies the tighter constraint to a mixed group', () => {
    // The image could go to -10, but the character pins the group at the grid edge.
    const charBbox = { col: 0, row: 0, w: 2, h: 2 };
    const imageBbox = { col: 4, row: 4, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: -5, dRow: 0 }, { charBbox, imageBbox }, GRID, GRID))
      .toEqual({ dCol: 0, dRow: 0 });
  });

  it('clamps a mixed group on the far side too', () => {
    const charBbox = { col: 8, row: 0, w: 2, h: 2 };  // already flush against the right grid edge
    const imageBbox = { col: 0, row: 0, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: 5, dRow: 0 }, { charBbox, imageBbox }, GRID, GRID))
      .toEqual({ dCol: 0, dRow: 0 });
  });

  it('applies the tighter constraint to a mixed group when the IMAGE is the tighter bound', () => {
    // The character has room to travel to -5, but the image is already flush against the margin
    // edge, so the image — not the character — pins the whole group's delta at 0. This is the
    // mirror image of the earlier "tighter constraint" cases, which both had the character as the
    // tighter bound; FEATURE-166 is exactly what introduces the margin an image can be pinned to.
    const charBbox = { col: 5, row: 0, w: 2, h: 2 };
    const imageBbox = { col: -MARGIN, row: 0, w: 2, h: 2 };
    expect(clampGroupDelta({ dCol: -5, dRow: 0 }, { charBbox, imageBbox }, GRID, GRID))
      .toEqual({ dCol: 0, dRow: 0 });
  });
});

describe('characterToMapToken rotation', () => {
  it('carries the placement rotation through', () => {
    const tk = characterToMapToken({ characterId: 'c1', positionX: 1, positionY: 2, w: 1, h: 1, rotation: 45 });
    expect(tk.rotation).toBe(45);
  });

  it('defaults to 0 for a placement saved before rotation existed', () => {
    const tk = characterToMapToken({ characterId: 'c1', positionX: 1, positionY: 2, w: 1, h: 1 });
    expect(tk.rotation).toBe(0);
  });
});

describe('clampToWorkspace', () => {
  // Grid 10x10 = 500x500 px, margin 100 cells = 5000 px → workspace [-5000, 5500] on both axes.
  const GRID = 10;

  it('leaves a position inside the grid untouched', () => {
    expect(clampToWorkspace(100, 200, 50, 50, GRID, GRID)).toEqual({ x: 100, y: 200 });
  });

  it('allows an image to sit fully in the off-scene margin', () => {
    expect(clampToWorkspace(-3000, -2500, 50, 50, GRID, GRID)).toEqual({ x: -3000, y: -2500 });
  });

  it('clamps at the far edge of the margin, not at the grid edge', () => {
    expect(clampToWorkspace(-99999, -99999, 50, 50, GRID, GRID)).toEqual({ x: -5000, y: -5000 });
  });

  it('clamps the bottom-right so the image stays fully within the workspace', () => {
    // maxX = 500 (grid) + 5000 (margin) - 50 (width) = 5450
    expect(clampToWorkspace(99999, 99999, 50, 50, GRID, GRID)).toEqual({ x: 5450, y: 5450 });
  });

  it('never lets the lower bound exceed the upper bound for an oversized image', () => {
    // A 12000px-wide image cannot satisfy both bounds; the lower bound wins so it stays draggable.
    const { x } = clampToWorkspace(-99999, 0, 12000, 50, GRID, GRID);
    expect(x).toBe(-5000);
  });

  it('keeps axes independent: asymmetric grid, size and offset each clamp against their own axis', () => {
    // gridWidth=6 (300px), gridHeight=12 (600px); width=40, height=80 — every value differs per
    // axis, so a swapped width/height or gridWidth/gridHeight pairing would fail this. Both x and
    // y are driven toward their own ceiling (not one toward its floor), so the maxY formula is
    // actually evaluated and pinned — a floor-bound y would return -margin regardless of maxY.
    // maxX = 300 + 5000 - 40 = 5260; maxY = 600 + 5000 - 80 = 5520
    expect(clampToWorkspace(99999, 99999, 40, 80, 6, 12)).toEqual({ x: 5260, y: 5520 });
  });
});

describe('clampSizeToWorkspace', () => {
  // Grid 10x10 = 500x500 px, margin 100 cells = 5000 px → workspace span 500 + 2*5000 = 10500.
  const GRID = 10;
  const MARGIN = 5000;

  it('leaves a size within the workspace untouched', () => {
    expect(clampSizeToWorkspace(50, 50, GRID, GRID)).toEqual({ width: 50, height: 50 });
  });

  it('caps a width larger than the workspace span to exactly the span', () => {
    // span = gridWidth*50 + 2*margin = 500 + 10000 = 10500
    expect(clampSizeToWorkspace(99999, 50, GRID, GRID)).toEqual({ width: 10500, height: 50 });
  });

  it('caps a height larger than its own span — width/height and gridWidth/gridHeight are all distinct here, so a swap of either pair in the implementation fails this test', () => {
    // gridWidth=6, gridHeight=12, width=40, height=99999.
    // span height = gridHeight*50 + 2*margin = 600 + 10000 = 10600
    expect(clampSizeToWorkspace(40, 99999, 6, 12)).toEqual({ width: 40, height: 10600 });
  });

  it('produces a size that, once positioned by clampToWorkspace, satisfies the backend workspace rule', () => {
    const { width, height } = clampSizeToWorkspace(99999, 99999, GRID, GRID);
    const { x, y } = clampToWorkspace(99999, 99999, width, height, GRID, GRID);
    // Backend rule: X+Width <= gridWidth*50+margin (and same for Y/height).
    expect(x + width).toBeLessThanOrEqual(GRID * 50 + MARGIN);
    expect(y + height).toBeLessThanOrEqual(GRID * 50 + MARGIN);
  });
});
