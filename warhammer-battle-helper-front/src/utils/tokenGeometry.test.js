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
