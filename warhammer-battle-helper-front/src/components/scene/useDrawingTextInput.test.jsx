import { renderHook, act } from '@testing-library/react';
import { useDrawingTextInput } from './useDrawingTextInput';

// useTokenRotate.test.jsx uses a Harness component because that hook needs a real
// element and a bounding box. This one is pure state, so renderHook is enough.
describe('useDrawingTextInput', () => {
  const setup = () => {
    const onCommit = jest.fn();
    const view = renderHook(() => useDrawingTextInput({ onCommit }));
    return { onCommit, view };
  };

  const place = (view, coords) => act(() => view.result.current.placeAt(coords));
  const type = (view, text) => act(() => view.result.current.setValue(text));

  it('opens the field at the clicked coordinates', () => {
    const { view } = setup();
    place(view, [10, 20]);
    expect(view.result.current.pos).toEqual([10, 20]);
    expect(view.result.current.value).toBe('');
  });

  it('saves the typed text at its original coordinates and closes when the map is clicked elsewhere', () => {
    const { view, onCommit } = setup();
    place(view, [10, 20]);
    type(view, 'Ambush');
    place(view, [200, 300]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ coords: [10, 20], text: 'Ambush' });
    expect(view.result.current.pos).toBeNull();
  });

  it('closes an empty field without saving when the map is clicked elsewhere', () => {
    const { view, onCommit } = setup();
    place(view, [10, 20]);
    place(view, [200, 300]);
    expect(onCommit).not.toHaveBeenCalled();
    expect(view.result.current.pos).toBeNull();
  });

  it('discards the typed text on cancel', () => {
    const { view, onCommit } = setup();
    place(view, [10, 20]);
    type(view, 'Ambush');
    act(() => view.result.current.cancel());
    expect(onCommit).not.toHaveBeenCalled();
    expect(view.result.current.pos).toBeNull();
  });

  it('trims the saved text and treats whitespace as empty', () => {
    const { view, onCommit } = setup();
    place(view, [10, 20]);
    type(view, '  Ambush  ');
    act(() => view.result.current.commit());
    expect(onCommit).toHaveBeenCalledWith({ coords: [10, 20], text: 'Ambush' });

    onCommit.mockClear();
    place(view, [30, 40]);
    type(view, '   ');
    act(() => view.result.current.commit());
    expect(onCommit).not.toHaveBeenCalled();
    expect(view.result.current.pos).toBeNull();
  });

  it('saves once when a late blur follows the map click', () => {
    const { view, onCommit } = setup();
    place(view, [10, 20]);
    type(view, 'Ambush');
    place(view, [200, 300]);
    act(() => view.result.current.commit());
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
