import { renderHook, fireEvent, act, waitFor } from '@testing-library/react';
import useSceneClipboard from './useSceneClipboard';
import { pasteSceneImages } from '../../api/scenes';

jest.mock('../../api/scenes', () => ({ pasteSceneImages: jest.fn() }));

// jsdom has no PointerEvent; a MouseEvent carrying the pointer type name works (see CLAUDE.md).
const pointerMove = (target, clientX, clientY) =>
  fireEvent(target, new MouseEvent('pointermove', { bubbles: true, clientX, clientY }));
const key = (k, mods = {}) => fireEvent.keyDown(document.body, { key: k, bubbles: true, cancelable: true, ...mods });

const img = (id, x, y) => ({ id, x, y, width: 50, height: 50 });

function setup(overrides = {}) {
  const viewport = document.body.appendChild(document.createElement('div'));
  const onSelect = jest.fn();
  const props = {
    enabled: true,
    gameId: 'g1',
    sceneId: 's1',
    images: [img('a', 100, 100), img('b', 200, 100)],
    selectedTokens: [{ kind: 'image', id: 'a' }, { kind: 'image', id: 'b' }],
    viewportRef: { current: viewport },
    clientToScenePx: (x, y) => ({ x, y }), // identity: client px == scene px in these tests
    snap: false,
    onSelect,
    ...overrides,
  };
  const view = renderHook((p) => useSceneClipboard(p), { initialProps: props });
  return { ...view, props, viewport, onSelect };
}

describe('useSceneClipboard', () => {
  beforeEach(() => {
    pasteSceneImages.mockReset();
    pasteSceneImages.mockResolvedValue([]);
    window.getSelection = () => ({ toString: () => '' });
  });
  afterEach(() => { document.body.innerHTML = ''; });

  test('Ctrl+C then Ctrl+V pastes the whole selection centred under the cursor', async () => {
    const { viewport } = setup();
    key('c', { ctrlKey: true });
    pointerMove(viewport, 400, 300);
    key('v', { ctrlKey: true });

    await waitFor(() => expect(pasteSceneImages).toHaveBeenCalledTimes(1));
    expect(pasteSceneImages).toHaveBeenCalledWith('g1', 's1', {
      sourceSceneId: 's1',
      items: [{ imageId: 'a', x: 325, y: 275 }, { imageId: 'b', x: 425, y: 275 }],
    });
  });

  test('pasting on another scene copies from the scene the images came from', async () => {
    const { rerender, props, viewport } = setup();
    key('c', { metaKey: true });
    rerender({ ...props, sceneId: 's2', images: [], selectedTokens: [] });
    pointerMove(viewport, 400, 300);
    key('v', { metaKey: true });

    await waitFor(() => expect(pasteSceneImages).toHaveBeenCalled());
    expect(pasteSceneImages.mock.calls[0][1]).toBe('s2');
    expect(pasteSceneImages.mock.calls[0][2].sourceSceneId).toBe('s1');
  });

  test('with the cursor off the map the copy cascades next to the original', async () => {
    setup();
    key('c', { ctrlKey: true });
    pointerMove(document.body, 400, 300); // outside the viewport
    key('v', { ctrlKey: true });

    await waitFor(() => expect(pasteSceneImages).toHaveBeenCalled());
    expect(pasteSceneImages.mock.calls[0][2].items[0]).toEqual({ imageId: 'a', x: 130, y: 130 });
  });

  test('the copies become the selection once they reach the scene', async () => {
    pasteSceneImages.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]);
    const { rerender, props, onSelect } = setup();
    key('c', { ctrlKey: true });
    key('v', { ctrlKey: true });
    await waitFor(() => expect(pasteSceneImages).toHaveBeenCalled());
    await act(() => pasteSceneImages.mock.results[0].value); // let the paste answer land

    // The HTTP answer can beat the SCENE_IMAGE_ADDED events; selecting ids the scene does not hold
    // yet would be pruned at once, so the hook waits for them.
    expect(onSelect).not.toHaveBeenCalled();
    rerender({ ...props, images: [...props.images, img('n1', 0, 0), img('n2', 0, 0)] });
    expect(onSelect).toHaveBeenCalledWith([{ kind: 'image', id: 'n1' }, { kind: 'image', id: 'n2' }], false);
  });

  test('the copies are selected also when their WS events beat the HTTP answer', async () => {
    let answer;
    pasteSceneImages.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const { rerender, props, onSelect } = setup();
    key('c', { ctrlKey: true });
    key('v', { ctrlKey: true });
    await waitFor(() => expect(pasteSceneImages).toHaveBeenCalled());

    rerender({ ...props, images: [...props.images, img('n1', 0, 0)] }); // SCENE_IMAGE_ADDED first
    await act(async () => { answer([{ id: 'n1' }]); });

    expect(onSelect).toHaveBeenCalledWith([{ kind: 'image', id: 'n1' }], false);
  });

  test('a large selection is pasted in batches the server accepts', async () => {
    const many = Array.from({ length: 25 }, (_, i) => img(`i${i}`, i * 10, 0));
    setup({ images: many, selectedTokens: many.map(m => ({ kind: 'image', id: m.id })) });
    key('c', { ctrlKey: true });
    key('v', { ctrlKey: true });

    await waitFor(() => expect(pasteSceneImages).toHaveBeenCalledTimes(2));
    expect(pasteSceneImages.mock.calls[0][2].items).toHaveLength(20);
    expect(pasteSceneImages.mock.calls[1][2].items).toHaveLength(5);
  });

  test('Ctrl+C leaves the key to the browser when no image is selected', () => {
    setup({ selectedTokens: [{ kind: 'char', id: 'x' }] });
    expect(key('c', { ctrlKey: true })).toBe(true); // not prevented
  });

  test('Ctrl+C leaves the key to the browser while text is selected (copying from the log)', () => {
    window.getSelection = () => ({ toString: () => 'rolled 17' });
    setup();
    expect(key('c', { ctrlKey: true })).toBe(true);
  });

  test('Ctrl+V with an empty clipboard leaves the key alone', () => {
    setup();
    expect(key('v', { ctrlKey: true })).toBe(true);
    expect(pasteSceneImages).not.toHaveBeenCalled();
  });

  test('a disabled clipboard (a player, or not the Select tool) does nothing', () => {
    setup({ enabled: false });
    key('c', { ctrlKey: true });
    key('v', { ctrlKey: true });
    expect(pasteSceneImages).not.toHaveBeenCalled();
  });
});
