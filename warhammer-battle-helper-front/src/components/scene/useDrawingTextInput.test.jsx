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
    expect(onCommit).toHaveBeenCalledWith({ coords: [10, 20], text: 'Ambush', style: {}, editingPath: null });
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
    expect(onCommit).toHaveBeenCalledWith({ coords: [10, 20], text: 'Ambush', style: {}, editingPath: null });

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

  it('does nothing when cancel is called on an already-closed field', () => {
    const { view, onCommit } = setup();
    act(() => view.result.current.cancel());
    expect(onCommit).not.toHaveBeenCalled();
    expect(view.result.current.pos).toBeNull();
  });

  it('does nothing when commit is called from initial mount', () => {
    const { view, onCommit } = setup();
    act(() => view.result.current.commit());
    expect(onCommit).not.toHaveBeenCalled();
    expect(view.result.current.pos).toBeNull();
  });

  it('reopens at the new coordinates with an empty value after a commit', () => {
    const { view } = setup();
    place(view, [10, 20]);
    type(view, 'Ambush');
    act(() => view.result.current.commit());
    place(view, [30, 40]);
    expect(view.result.current.pos).toEqual([30, 40]);
    expect(view.result.current.value).toBe('');
  });

  describe('editing an existing label', () => {
    const label = { id: 'p1', points: [[5, 6]], text: 'Bridge', fontSize: 16, bold: false };
    const edit = (view) => act(() => view.result.current.editPath(label, { fontSize: 16, bold: false }));

    it('opens at the label anchor with its text and style', () => {
      const { view } = setup();
      edit(view);
      expect(view.result.current.pos).toEqual([5, 6]);
      expect(view.result.current.value).toBe('Bridge');
      expect(view.result.current.style).toEqual({ fontSize: 16, bold: false });
      expect(view.result.current.editingPath).toBe(label);
    });

    it('saves the new text and style together with the edited path', () => {
      const { view, onCommit } = setup();
      edit(view);
      type(view, 'Old bridge');
      act(() => view.result.current.setStyle({ bold: true }));
      act(() => view.result.current.commit());
      expect(onCommit).toHaveBeenCalledWith({
        coords: [5, 6], text: 'Old bridge', style: { fontSize: 16, bold: true }, editingPath: label,
      });
    });

    it('reports a cleared label so the caller can delete it', () => {
      const { view, onCommit } = setup();
      edit(view);
      type(view, '  ');
      act(() => view.result.current.commit());
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ text: '', editingPath: label }));
    });

    it('does not save an edit that changed nothing', () => {
      const { view, onCommit } = setup();
      edit(view);
      act(() => view.result.current.commit());
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('commits the open field instead of switching to another label', () => {
      const { view, onCommit } = setup();
      place(view, [10, 20]);
      type(view, 'Ambush');
      edit(view);
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(view.result.current.pos).toBeNull();
    });
  });
});
