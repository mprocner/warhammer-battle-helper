import { renderHook, act } from '@testing-library/react';
import useDragRuler, { isPrivateDrag } from './useDragRuler';

const IMAGES = [
  { id: 'img-visible', hidden: false },
  { id: 'img-hidden', hidden: true },
];
const CHARACTERS = [
  { characterId: 'char-visible', hidden: false },
  { characterId: 'char-hidden', hidden: true },
];

function setup(sendMessage) {
  return renderHook(() => useDragRuler({
    sendMessage,
    sceneId: 'scene-1',
    userId: 'gm-1',
    userName: 'GM',
    images: IMAGES,
    characters: CHARACTERS,
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
