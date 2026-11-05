import { renderHook, act } from '@testing-library/react';
import { useRollPrompt } from './useRollPrompt';

const enabledTemplate = { settings: { modifier: { enabled: true } } };
const request = { skillKey: 'fld_1', label: 'Perswazja' };

describe('useRollPrompt', () => {
  it('rolls immediately with no modifier when the template has none configured', () => {
    const onRoll = jest.fn();
    const { result } = renderHook(() => useRollPrompt({}, onRoll));

    act(() => result.current.promptRoll(request));

    expect(onRoll).toHaveBeenCalledWith(request, 0);
    expect(result.current.pending).toBeNull();
    expect(result.current.modifierConfig).toBeNull();
  });

  it('holds the request until it is confirmed when the modifier is enabled', () => {
    const onRoll = jest.fn();
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, onRoll));

    act(() => result.current.promptRoll(request));
    expect(onRoll).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual(request);

    act(() => result.current.confirmRoll(-20));
    expect(onRoll).toHaveBeenCalledWith(request, -20);
    expect(result.current.pending).toBeNull();
  });

  it('rolls immediately for a dice template with both maxima 0', () => {
    const onRoll = jest.fn();
    const tpl = { settings: { modifier: { enabled: true, kind: 'dice', maxEdge: 0, maxSetback: 0 } } };
    const { result } = renderHook(() => useRollPrompt(tpl, onRoll));

    act(() => result.current.promptRoll(request));

    expect(onRoll).toHaveBeenCalledWith(request, 0);
    expect(result.current.pending).toBeNull();
  });

  it('still holds the request for a dice template with maxEdge 1', () => {
    const onRoll = jest.fn();
    const tpl = { settings: { modifier: { enabled: true, kind: 'dice', maxEdge: 1, maxSetback: 0 } } };
    const { result } = renderHook(() => useRollPrompt(tpl, onRoll));

    act(() => result.current.promptRoll(request));

    expect(onRoll).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual(request);
  });

  it('drops the request on cancel without rolling', () => {
    const onRoll = jest.fn();
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, onRoll));

    act(() => result.current.promptRoll(request));
    act(() => result.current.cancelRoll());

    expect(onRoll).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it('ignores a confirm with nothing pending', () => {
    const onRoll = jest.fn();
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, onRoll));

    act(() => result.current.confirmRoll(10));

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('carries a weapon request through unchanged', () => {
    const onRoll = jest.fn();
    const weapon = { weaponFieldKey: 'fld_w', weaponRowId: 'row_1', label: 'Miecz' };
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, onRoll));

    act(() => result.current.promptRoll(weapon));
    act(() => result.current.confirmRoll(5));

    expect(onRoll).toHaveBeenCalledWith(weapon, 5);
  });

  it('remembers where a mouse click happened', () => {
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, jest.fn()));

    act(() => result.current.trackClick({ detail: 1, clientX: 40, clientY: 90 }));
    act(() => result.current.promptRoll(request));

    expect(result.current.pendingPos).toEqual({ x: 40, y: 90 });
  });

  it('clears the position on cancel', () => {
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, jest.fn()));

    act(() => result.current.trackClick({ detail: 1, clientX: 40, clientY: 90 }));
    act(() => result.current.promptRoll(request));
    act(() => result.current.cancelRoll());

    expect(result.current.pendingPos).toBeNull();
  });

  it('does not reuse a consumed click for a later roll without one', () => {
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, jest.fn()));

    act(() => result.current.trackClick({ detail: 1, clientX: 40, clientY: 90 }));
    act(() => result.current.promptRoll(request));
    act(() => result.current.cancelRoll());
    act(() => result.current.promptRoll(request));

    expect(result.current.pendingPos).toBeNull();
  });

  // Keyboard activation (Enter/Space) has detail 0 and clientX/Y 0, so the button's centre stands in.
  it('uses the element centre for a keyboard activation', () => {
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, jest.fn()));
    const target = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 30, height: 40 }) };

    act(() => result.current.trackClick({ detail: 0, clientX: 0, clientY: 0, target }));
    act(() => result.current.promptRoll(request));

    expect(result.current.pendingPos).toEqual({ x: 25, y: 40 });
  });

  it('clears the position when the roll is confirmed', () => {
    const { result } = renderHook(() => useRollPrompt(enabledTemplate, jest.fn()));

    act(() => result.current.trackClick({ detail: 1, clientX: 40, clientY: 90 }));
    act(() => result.current.promptRoll(request));
    act(() => result.current.confirmRoll(1));

    expect(result.current.pendingPos).toBeNull();
  });
});
