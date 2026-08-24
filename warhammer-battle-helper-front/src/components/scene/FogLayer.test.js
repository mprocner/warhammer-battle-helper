import { canClosePolygon } from './FogLayer';

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
