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
});
