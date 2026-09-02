import { canClosePolygon, fogVisibleFor, fogCssOpacity } from './FogLayer';

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
describe('fogCssOpacity', () => {
  it('pins a player at full opacity regardless of the preference passed', () => {
    expect(fogCssOpacity({ isGM: false, fogGmOpacity: 0.1 })).toBe(1.0);
    expect(fogCssOpacity({ isGM: false, fogGmOpacity: 1.0 })).toBe(1.0);
  });

  it('passes the GM preference through unchanged', () => {
    expect(fogCssOpacity({ isGM: true, fogGmOpacity: 0.1 })).toBe(0.1);
    expect(fogCssOpacity({ isGM: true, fogGmOpacity: 0.7 })).toBe(0.7);
  });
});
