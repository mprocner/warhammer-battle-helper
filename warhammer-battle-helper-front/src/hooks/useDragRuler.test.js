import { renderHook, act } from '@testing-library/react';
import useDragRuler, { isPrivateDrag, isOffscenePoint } from './useDragRuler';

const IMAGES = [
  { id: 'img-visible', hidden: false, layer: 'tokens' },
  { id: 'img-hidden', hidden: true, layer: 'tokens' },
  { id: 'img-gm', layer: 'gm' }, // no `hidden` flag — gm layer alone makes it private
  { id: 'img-tokens-bare', layer: 'tokens' }, // no `hidden` flag — tokens layer stays public
];
const CHARACTERS = [
  { characterId: 'char-visible', hidden: false },
  { characterId: 'char-hidden', hidden: true },
];

const GRID = { gridWidth: 20, gridHeight: 20 };

function setup(sendMessage, overrides = {}) {
  return renderHook(() => useDragRuler({
    sendMessage,
    sceneId: 'scene-1',
    userId: 'gm-1',
    userName: 'GM',
    images: IMAGES,
    characters: CHARACTERS,
    ...GRID,
    ...overrides,
  }));
}

describe('isPrivateDrag', () => {
  const scene = { images: IMAGES, characters: CHARACTERS };

  test('an empty or missing token list is not private', () => {
    expect(isPrivateDrag([], scene)).toBe(false);
    expect(isPrivateDrag(undefined, scene)).toBe(false);
  });

  test('a visible token is not private, a hidden one is', () => {
    expect(isPrivateDrag([{ kind: 'char', id: 'char-visible' }], scene)).toBe(false);
    expect(isPrivateDrag([{ kind: 'char', id: 'char-hidden' }], scene)).toBe(true);
    expect(isPrivateDrag([{ kind: 'image', id: 'img-visible' }], scene)).toBe(false);
    expect(isPrivateDrag([{ kind: 'image', id: 'img-hidden' }], scene)).toBe(true);
  });

  test('one hidden token makes the whole group private', () => {
    const group = [
      { kind: 'char', id: 'char-visible' },
      { kind: 'image', id: 'img-visible' },
      { kind: 'char', id: 'char-hidden' },
    ];
    expect(isPrivateDrag(group, scene)).toBe(true);
  });

  test('an id it cannot resolve counts as hidden (fail closed)', () => {
    expect(isPrivateDrag([{ kind: 'char', id: 'ghost' }], scene)).toBe(true);
    expect(isPrivateDrag([{ kind: 'image', id: 'ghost' }], scene)).toBe(true);
  });

  test('a malformed kind fails closed', () => {
    expect(isPrivateDrag([{ kind: 'blob', id: 'x' }], scene)).toBe(true);
  });

  test('a gm-layer image is private even without a hidden flag; a tokens-layer image is not', () => {
    expect(isPrivateDrag([{ kind: 'image', id: 'img-gm' }], scene)).toBe(true);
    expect(isPrivateDrag([{ kind: 'image', id: 'img-tokens-bare' }], scene)).toBe(false);
  });
});

describe('useDragRuler', () => {
  test('broadcasts the ruler while dragging a visible character token', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 1, row: 1 }, [{ kind: 'char', id: 'char-visible' }]));

    expect(sendMessage).toHaveBeenCalledWith('MAP_RULER', {
      sceneId: 'scene-1',
      userId: 'gm-1',
      name: 'GM',
      from: { col: 1, row: 1 },
      to: { col: 1, row: 1 },
      active: true,
      aoe: false,
    });

    act(() => result.current.onMeasureEnd());

    expect(sendMessage).toHaveBeenLastCalledWith('MAP_RULER', expect.objectContaining({ active: false }));
  });

  test('keeps the ruler local when the dragged character token is hidden', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 2, row: 3 }, [{ kind: 'char', id: 'char-hidden' }]));

    expect(result.current.dragRuler).toEqual({ from: { col: 2, row: 3 }, to: { col: 2, row: 3 } });

    act(() => result.current.onMeasureMove({ col: 5, row: 3 }));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local when the dragged image token is hidden', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 0, row: 0 }, [{ kind: 'image', id: 'img-hidden' }]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local when the dragged image token is on the gm layer', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 0, row: 0 }, [{ kind: 'image', id: 'img-gm' }]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('broadcasts while dragging a tokens-layer image without a hidden flag', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 0, row: 0 }, [{ kind: 'image', id: 'img-tokens-bare' }]));

    expect(sendMessage).toHaveBeenCalledWith('MAP_RULER', expect.objectContaining({ active: true }));
  });

  test('keeps the ruler local when a group holds one hidden token', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 4, row: 4 }, [
      { kind: 'image', id: 'img-visible' },
      { kind: 'char', id: 'char-hidden' },
    ]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local for a token id it cannot resolve', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 1, row: 1 }, [{ kind: 'char', id: 'ghost' }]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('a later visible drag broadcasts again after a private one', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 1, row: 1 }, [{ kind: 'char', id: 'char-hidden' }]));
    act(() => result.current.onMeasureEnd());
    expect(sendMessage).not.toHaveBeenCalled();

    act(() => result.current.onMeasureStart({ col: 2, row: 2 }, [{ kind: 'char', id: 'char-visible' }]));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  test('onMeasureEnd with no prior start sends nothing', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('dragRuler is null after onMeasureEnd', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 1, row: 1 }, [{ kind: 'char', id: 'char-visible' }]));
    expect(result.current.dragRuler).not.toBeNull();

    act(() => result.current.onMeasureEnd());
    expect(result.current.dragRuler).toBeNull();
  });

  test('a scene update mid-drag cannot flip a private drag public', () => {
    const sendMessage = jest.fn();
    const initialProps = {
      sendMessage,
      sceneId: 'scene-1',
      userId: 'gm-1',
      userName: 'GM',
      images: IMAGES,
      characters: CHARACTERS,
    };
    const { result, rerender } = renderHook((props) => useDragRuler(props), { initialProps });

    act(() => result.current.onMeasureStart({ col: 1, row: 1 }, [{ kind: 'char', id: 'char-hidden' }]));

    // Scene update mid-drag: the dragged character is no longer hidden.
    const revealedCharacters = CHARACTERS.map(c => (
      c.characterId === 'char-hidden' ? { ...c, hidden: false } : c
    ));
    rerender({ ...initialProps, characters: revealedCharacters });

    act(() => result.current.onMeasureMove({ col: 2, row: 1 }));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("a new drag's start frame is never eaten by the previous drag's throttle window", () => {
    const sendMessage = jest.fn();
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000);

    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 0, row: 0 }, [{ kind: 'char', id: 'char-visible' }]));
    expect(sendMessage).toHaveBeenCalledTimes(1);

    act(() => result.current.onMeasureEnd());
    expect(sendMessage).toHaveBeenCalledTimes(2);

    // Next drag starts 30 ms later — inside the 50 ms throttle window stamped by the first drag's
    // start send. Without resetting the throttle, this start frame would be silently dropped.
    nowSpy.mockReturnValue(1030);
    act(() => result.current.onMeasureStart({ col: 5, row: 5 }, [{ kind: 'char', id: 'char-visible' }]));

    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).toHaveBeenLastCalledWith('MAP_RULER', expect.objectContaining({
      from: { col: 5, row: 5 },
      to: { col: 5, row: 5 },
      active: true,
    }));

    nowSpy.mockRestore();
  });

  test('throttles live updates to one send per 50 ms window', () => {
    const sendMessage = jest.fn();
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000);

    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 0, row: 0 }, [{ kind: 'char', id: 'char-visible' }]));
    expect(sendMessage).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1020);
    act(() => result.current.onMeasureMove({ col: 1, row: 0 }));
    expect(sendMessage).toHaveBeenCalledTimes(1); // inside the window — dropped

    nowSpy.mockReturnValue(1060);
    act(() => result.current.onMeasureMove({ col: 2, row: 0 }));
    expect(sendMessage).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });
});

describe('isOffscenePoint', () => {
  const grid = { gridWidth: 20, gridHeight: 20 };

  test('a point inside the grid is on-scene', () => {
    expect(isOffscenePoint({ col: 0, row: 0 }, grid)).toBe(false);
    expect(isOffscenePoint({ col: 10.5, row: 3.5 }, grid)).toBe(false);
    expect(isOffscenePoint({ col: 20, row: 20 }, grid)).toBe(false); // the far edge still counts
  });

  test('a point in the staging margin is off-scene', () => {
    expect(isOffscenePoint({ col: -5, row: 10 }, grid)).toBe(true);
    expect(isOffscenePoint({ col: 25, row: 10 }, grid)).toBe(true);
    expect(isOffscenePoint({ col: 10, row: -0.5 }, grid)).toBe(true);
    expect(isOffscenePoint({ col: 10, row: 20.5 }, grid)).toBe(true);
  });

  test('unusable grid dimensions fail closed', () => {
    expect(isOffscenePoint({ col: 1, row: 1 }, {})).toBe(true);
    expect(isOffscenePoint({ col: 1, row: 1 }, { gridWidth: 20 })).toBe(true);
    expect(isOffscenePoint({ col: 1, row: 1 }, { gridWidth: NaN, gridHeight: 20 })).toBe(true);
  });

  test('an unusable point fails closed', () => {
    expect(isOffscenePoint(null, grid)).toBe(true);
    expect(isOffscenePoint({ col: NaN, row: 1 }, grid)).toBe(true);
  });
});

describe('useDragRuler off-scene gate', () => {
  test('keeps the ruler local when the drag starts in the staging margin', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: -4, row: 5 }, [{ kind: 'char', id: 'char-visible' }]));

    // The dragger still gets their own readout — only the broadcast is suppressed.
    expect(result.current.dragRuler).toEqual({ from: { col: -4, row: 5 }, to: { col: -4, row: 5 } });

    act(() => result.current.onMeasureMove({ col: 6, row: 5 }));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local when the drag starts past the far grid edge', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 5, row: 24 }, [{ kind: 'char', id: 'char-visible' }]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local when the grid dimensions are missing', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage, { gridWidth: undefined, gridHeight: undefined });

    act(() => result.current.onMeasureStart({ col: 1, row: 1 }, [{ kind: 'char', id: 'char-visible' }]));
    act(() => result.current.onMeasureEnd());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('a drag that starts on-scene and moves off-scene keeps broadcasting', () => {
    const sendMessage = jest.fn();
    // Mock Date.now, same as the file's other throttle-sensitive tests: back-to-back act() calls
    // land within the 50 ms SEND_THROTTLE_MS window in real time, which would swallow the move's
    // send regardless of isOffscenePoint and falsely fail this assertion.
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000);
    const { result } = setup(sendMessage);

    act(() => result.current.onMeasureStart({ col: 3, row: 3 }, [{ kind: 'char', id: 'char-visible' }]));
    nowSpy.mockReturnValue(1060);
    act(() => result.current.onMeasureMove({ col: -8, row: 3 }));

    expect(sendMessage).toHaveBeenLastCalledWith('MAP_RULER', expect.objectContaining({
      from: { col: 3, row: 3 },
      to: { col: -8, row: 3 },
      active: true,
    }));

    nowSpy.mockRestore();
  });
});
