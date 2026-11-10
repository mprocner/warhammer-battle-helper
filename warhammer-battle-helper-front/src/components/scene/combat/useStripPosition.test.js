import { renderHook, act } from '@testing-library/react';
import useStripPosition, { clampPosition, readStoredPosition } from './useStripPosition';

test('clampPosition keeps the whole strip inside the bounds', () => {
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

describe('useStripPosition', () => {
  const rect = (width, height) => ({ left: 0, top: 0, width, height, right: width, bottom: height });
  const fire = (type, x = 0, y = 0) =>
    act(() => { document.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })); });

  function setup() {
    const bounds = document.createElement('div');
    bounds.getBoundingClientRect = () => rect(500, 300);
    const strip = document.createElement('div');
    strip.getBoundingClientRect = () => rect(200, 50);
    const mapRef = { current: bounds };
    const utils = renderHook(() => useStripPosition('g1', mapRef));
    act(() => utils.result.current.stripRef(strip));
    return utils;
  }
  const grip = { button: 0, clientX: 0, clientY: 0, preventDefault: () => {} };

  afterEach(() => { jest.restoreAllMocks(); window.localStorage.clear(); });

  test('pointercancel ends the drag and stores the last position', () => {
    const { result } = setup();
    act(() => result.current.onGripPointerDown(grip));
    fire('pointermove', 40, 30);
    fire('pointercancel');
    expect(JSON.parse(window.localStorage.getItem('combatStripPos:g1'))).toEqual({ x: 40, y: 30 });
    fire('pointermove', 90, 90);
    expect(result.current.position).toEqual({ x: 40, y: 30 });
  });

  test('unmounting mid-drag removes the listeners', () => {
    const { result, unmount } = setup();
    act(() => result.current.onGripPointerDown(grip));
    fire('pointermove', 40, 30);
    unmount();
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    fire('pointermove', 90, 90);
    fire('pointerup');
    expect(err).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('combatStripPos:g1')).toBeNull();
  });

  // The strip may go anywhere in the browser window (jsdom: 1024×768), not only over the map.
  test('a stored position outside the window is clamped after mount, without writing storage', () => {
    window.localStorage.setItem('combatStripPos:g1', JSON.stringify({ x: 1900, y: 1000 }));
    const { result } = setup();
    expect(result.current.position).toEqual({ x: 824, y: 718 });
    expect(JSON.parse(window.localStorage.getItem('combatStripPos:g1'))).toEqual({ x: 1900, y: 1000 });
  });

  test('re-clamps once the strip element appears after the first render', () => {
    window.localStorage.setItem('combatStripPos:g1', JSON.stringify({ x: 1900, y: 1000 }));
    const bounds = document.createElement('div');
    bounds.getBoundingClientRect = () => rect(500, 300);
    const strip = document.createElement('div');
    strip.getBoundingClientRect = () => rect(200, 50);
    const mapRef = { current: bounds };
    // Mimic CombatStrip: no strip node on the first render (combat still loading).
    const { result } = renderHook(() => useStripPosition('g1', mapRef));
    expect(result.current.position).toEqual({ x: 1900, y: 1000 });
    act(() => result.current.stripRef(strip));
    expect(result.current.position).toEqual({ x: 824, y: 718 });
    expect(JSON.parse(window.localStorage.getItem('combatStripPos:g1'))).toEqual({ x: 1900, y: 1000 });
  });

  test('may be dragged past the map onto a side panel', () => {
    const { result } = setup(); // map area 500×300
    act(() => result.current.onGripPointerDown(grip));
    fire('pointermove', 700, 600);
    fire('pointerup');
    expect(result.current.position).toEqual({ x: 700, y: 600 });
  });

  test('default spot is centred over the map, below the scene tab bars', () => {
    const map = document.createElement('div');
    map.getBoundingClientRect = () => ({ left: 300, top: 0, width: 600, height: 700, right: 900, bottom: 700 });
    const bars = document.createElement('div');
    bars.className = 'top-bars';
    Object.defineProperty(bars, 'offsetHeight', { value: 74 });
    map.appendChild(bars);
    const mapRef = { current: map };
    const { result } = renderHook(() => useStripPosition('g1', mapRef));
    expect(result.current.defaultSpot).toEqual({ top: 106, centerX: 600 });
  });
});
