import {
  canClosePolygon, fogVisibleFor, fogShadeAlpha, usesBrushCursor, lineRectCorners,
} from './FogLayer';

// Wielokąt potrzebuje trzech wierzchołków, żeby w ogóle być figurą — przy mniejszej
// liczbie prawy przycisk porzuca rysunek zamiast go zapisywać.
const points = (n) => Array.from({ length: n }, (_, i) => [i * 10, i * 10]);

describe('canClosePolygon', () => {
  it('pusta lista nie domyka się', () => {
    expect(canClosePolygon(points(0))).toBe(false);
  });

  it('jeden wierzchołek nie domyka się', () => {
    expect(canClosePolygon(points(1))).toBe(false);
  });

  it('dwa wierzchołki nie domykają się — to odcinek, nie figura', () => {
    expect(canClosePolygon(points(2))).toBe(false);
  });

  it('trzy wierzchołki domykają się', () => {
    expect(canClosePolygon(points(3))).toBe(true);
  });

  it('cztery wierzchołki domykają się', () => {
    expect(canClosePolygon(points(4))).toBe(true);
  });
});

// Full truth table — the predicate must be total, including combinations today's caller
// never produces (a player never has inFogMode).
describe('fogVisibleFor', () => {
  it('a player sees fog only when the scene has it enabled', () => {
    expect(fogVisibleFor({ isGM: false, fogEnabled: true, inFogMode: false })).toBe(true);
    expect(fogVisibleFor({ isGM: false, fogEnabled: false, inFogMode: false })).toBe(false);
  });

  it('the GM sees enabled fog in every mode — this is the feature', () => {
    expect(fogVisibleFor({ isGM: true, fogEnabled: true, inFogMode: false })).toBe(true);
    expect(fogVisibleFor({ isGM: true, fogEnabled: true, inFogMode: true })).toBe(true);
  });

  it('with fog disabled the GM sees the layer only in fog mode — painting ahead of time', () => {
    expect(fogVisibleFor({ isGM: true, fogEnabled: false, inFogMode: true })).toBe(true);
    expect(fogVisibleFor({ isGM: true, fogEnabled: false, inFogMode: false })).toBe(false);
  });

  it('the fog-mode flag reveals nothing to a player', () => {
    expect(fogVisibleFor({ isGM: false, fogEnabled: false, inFogMode: true })).toBe(false);
    expect(fogVisibleFor({ isGM: false, fogEnabled: true, inFogMode: true })).toBe(true);
  });
});

// The only line in the branch that could leak map information — a player must never
// receive see-through fog, regardless of what preference is passed in.
describe('fogShadeAlpha', () => {
  it('pins a player at full opacity regardless of the preference passed', () => {
    expect(fogShadeAlpha({ isGM: false, fogGmOpacity: 0.1 })).toBe(1.0);
    expect(fogShadeAlpha({ isGM: false, fogGmOpacity: 1.0 })).toBe(1.0);
  });

  it('passes the GM preference through unchanged', () => {
    expect(fogShadeAlpha({ isGM: true, fogGmOpacity: 0.1 })).toBe(0.1);
    expect(fogShadeAlpha({ isGM: true, fogGmOpacity: 0.7 })).toBe(0.7);
  });
});

// The brush ring is the only signal of brushSize the user gets. It must appear for exactly
// those tools whose reach brushSize decides.
describe('usesBrushCursor', () => {
  it('pędzel i linia pokazują pierścień — obie rysują pociągnięciem o szerokości brushSize', () => {
    expect(usesBrushCursor('freehand')).toBe(true);
    expect(usesBrushCursor('line')).toBe(true);
  });

  it('prostokąt i koło wypełniają obszar, więc brushSize ich nie dotyczy', () => {
    expect(usesBrushCursor('rect')).toBe(false);
    expect(usesBrushCursor('circle')).toBe(false);
  });

  it('wielokąt ma własny overlay, a pan nie rysuje nic', () => {
    expect(usesBrushCursor('polygon')).toBe(false);
    expect(usesBrushCursor('pan')).toBe(false);
  });
});

// The four corners of the rectangle a thick straight stroke covers — the segment offset by
// half the width along its own normal, in both directions. Expected numbers below are
// hardcoded rather than derived from the formula under test, so a flipped normal sign would
// actually fail the test instead of passing against itself.
describe('lineRectCorners', () => {
  it('linia pozioma — normalna jest pionowa', () => {
    const corners = lineRectCorners([0, 0], [10, 0], 5);
    expect(corners).toEqual([
      [0, 5],
      [10, 5],
      [10, -5],
      [0, -5],
    ]);
  });

  it('linia pod 45° — narożniki przesunięte wzdłuż normalnej', () => {
    const corners = lineRectCorners([0, 0], [10, 10], 4);
    // halfWidth / sqrt(2): the 45° offset magnitude, worked out independently of atan2/sin/cos.
    const offset = 4 / Math.SQRT2;
    expect(corners[0][0]).toBeCloseTo(-offset);
    expect(corners[0][1]).toBeCloseTo(offset);
    expect(corners[1][0]).toBeCloseTo(10 - offset);
    expect(corners[1][1]).toBeCloseTo(10 + offset);
    expect(corners[2][0]).toBeCloseTo(10 + offset);
    expect(corners[2][1]).toBeCloseTo(10 - offset);
    expect(corners[3][0]).toBeCloseTo(offset);
    expect(corners[3][1]).toBeCloseTo(-offset);
  });

  it('zerowa długość degeneruje się do sliveru o zerowym polu', () => {
    // atan2(0, 0) === 0, so the normal points straight along y and both ends collapse onto
    // the same x. The stroke itself is invisible at zero length too, so this stays consistent.
    const corners = lineRectCorners([5, 5], [5, 5], 6);
    expect(corners).toEqual([
      [5, 11],
      [5, 11],
      [5, -1],
      [5, -1],
    ]);
  });
});
