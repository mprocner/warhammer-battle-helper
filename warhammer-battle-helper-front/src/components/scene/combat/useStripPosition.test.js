import { clampPosition, readStoredPosition } from './useStripPosition';

test('clampPosition keeps the strip inside the map', () => {
  const bounds = { width: 500, height: 300 };
  const size = { width: 200, height: 50 };
  expect(clampPosition({ x: -20, y: 10 }, bounds, size)).toEqual({ x: 0, y: 10 });
  expect(clampPosition({ x: 450, y: 290 }, bounds, size)).toEqual({ x: 300, y: 250 });
  expect(clampPosition({ x: 10, y: 10 }, { width: 100, height: 20 }, size)).toEqual({ x: 0, y: 0 });
});

describe('readStoredPosition', () => {
  afterEach(() => { jest.restoreAllMocks(); window.localStorage.clear(); });

  test('reads a stored position', () => {
    window.localStorage.setItem('combatStripPos:g1', JSON.stringify({ x: 5, y: 6 }));
    expect(readStoredPosition('g1')).toEqual({ x: 5, y: 6 });
  });

  test('ignores garbage', () => {
    window.localStorage.setItem('combatStripPos:g1', '{"x":"a"}');
    expect(readStoredPosition('g1')).toBeNull();
  });

  test('survives a throwing storage (private mode)', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readStoredPosition('g1')).toBeNull();
  });
});
