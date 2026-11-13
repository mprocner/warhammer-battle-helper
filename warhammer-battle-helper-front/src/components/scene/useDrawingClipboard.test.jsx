import { renderHook, fireEvent, act, waitFor } from '@testing-library/react';
import useDrawingClipboard from './useDrawingClipboard';
import { pasteDrawingPaths } from '../../api/scenes';

jest.mock('../../api/scenes', () => ({ pasteDrawingPaths: jest.fn() }));

// jsdom has no PointerEvent; a MouseEvent carrying the pointer type name works (see CLAUDE.md).
const pointerMove = (target, clientX, clientY) =>
  fireEvent(target, new MouseEvent('pointermove', { bubbles: true, clientX, clientY }));
const key = (k, mods = {}) => fireEvent.keyDown(document.body, { key: k, bubbles: true, cancelable: true, ...mods });

const line = (id, x, y) => ({ id, userId: 'u1', tool: 'line', brushSize: 0, points: [[x, y], [x + 10, y + 10]] });

function setup(overrides = {}) {
  const viewport = document.body.appendChild(document.createElement('div'));
  const onPasted = jest.fn();
  const props = {
    enabled: true,
    canCopy: true,
    gameId: 'g1',
    sceneId: 's1',
    paths: [line('a', 100, 100), line('b', 200, 100)],
    selectedIds: ['a', 'b'],
    viewportRef: { current: viewport },
    clientToScenePx: (x, y) => ({ x, y }), // identity: client px == scene px in these tests
    canvasSize: { width: 2000, height: 2000 },
    onPasted,
    ...overrides,
  };
  const view = renderHook((p) => useDrawingClipboard(p), { initialProps: props });
  return { ...view, props, viewport, onPasted };
}

describe('useDrawingClipboard', () => {
  beforeEach(() => {
    pasteDrawingPaths.mockReset();
    pasteDrawingPaths.mockResolvedValue([]);
    window.getSelection = () => ({ toString: () => '' });
  });
  afterEach(() => { document.body.innerHTML = ''; });

  test('Ctrl+C then Ctrl+V pastes the selection centred under the cursor', async () => {
    const { viewport } = setup();
    key('c', { ctrlKey: true });
    pointerMove(viewport, 400, 300);
    key('v', { ctrlKey: true });

    await waitFor(() => expect(pasteDrawingPaths).toHaveBeenCalledTimes(1));
    const [gameId, sceneId, paths] = pasteDrawingPaths.mock.calls[0];
    expect([gameId, sceneId]).toEqual(['g1', 's1']);
    // Group box (100,100)→(210,110), centre (155,105) moves to (400,300).
    expect(paths.map(p => p.points[0])).toEqual([[345, 295], [445, 295]]);
    expect(paths[0].id).toBeUndefined();
  });

  test('the clipboard survives a scene switch', async () => {
    const { rerender, props } = setup();
    key('c', { metaKey: true });
    rerender({ ...props, sceneId: 's2', paths: [], selectedIds: [] });
    key('v', { metaKey: true });

    await waitFor(() => expect(pasteDrawingPaths).toHaveBeenCalled());
    expect(pasteDrawingPaths.mock.calls[0][1]).toBe('s2');
  });

  test('the copies are handed over once the scene holds them, whichever comes first', async () => {
    pasteDrawingPaths.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]);
    const { rerender, props, onPasted } = setup();
    key('c', { ctrlKey: true });
    key('v', { ctrlKey: true });
    await waitFor(() => expect(pasteDrawingPaths).toHaveBeenCalled());
    await act(() => pasteDrawingPaths.mock.results[0].value);

    expect(onPasted).not.toHaveBeenCalled();
    rerender({ ...props, paths: [...props.paths, line('n1', 0, 0), line('n2', 0, 0)] });
    expect(onPasted).toHaveBeenCalledWith(['n1', 'n2']);
  });

  test('a large clipboard is pasted in batches the server accepts', async () => {
    const many = Array.from({ length: 60 }, (_, i) => line(`p${i}`, i, 0));
    setup({ paths: many, selectedIds: many.map(p => p.id) });
    key('c', { ctrlKey: true });
    key('v', { ctrlKey: true });

    await waitFor(() => expect(pasteDrawingPaths).toHaveBeenCalledTimes(2));
    expect(pasteDrawingPaths.mock.calls[0][2]).toHaveLength(50);
    expect(pasteDrawingPaths.mock.calls[1][2]).toHaveLength(10);
  });

  test('Ctrl+C leaves the key to the browser when copying is off', () => {
    setup({ canCopy: false });
    expect(key('c', { ctrlKey: true })).toBe(true); // not prevented
  });

  test('Ctrl+V does nothing before anything was copied', () => {
    setup();
    expect(key('v', { ctrlKey: true })).toBe(true);
    expect(pasteDrawingPaths).not.toHaveBeenCalled();
  });
});
