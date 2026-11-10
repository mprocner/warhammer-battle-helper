import { renderHook, act, waitFor } from '@testing-library/react';
import { useDiceAnimationSetting } from './useDiceAnimationSetting';
import { getSettings, updateSettings } from '../api/settings';

// Factory mock: the real module pulls in axios (ESM), which CRA's jest transform rejects.
jest.mock('../api/settings', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
}));

const mockReducedMotion = (reduce) => {
  window.matchMedia = jest.fn().mockImplementation(query => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
  }));
};

describe('useDiceAnimationSetting', () => {
  beforeEach(() => {
    // resetMocks: true in CRA's jest config wipes implementations before every test.
    updateSettings.mockResolvedValue({});
    mockReducedMotion(false);
  });

  it('defaults to on when nothing is saved', async () => {
    getSettings.mockResolvedValue({});
    const { result } = renderHook(() => useDiceAnimationSetting());
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toBe(true);
  });

  it('defaults to off when the system asks for reduced motion', async () => {
    mockReducedMotion(true);
    getSettings.mockResolvedValue({});
    const { result } = renderHook(() => useDiceAnimationSetting());
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toBe(false);
  });

  it('a saved choice beats reduced motion', async () => {
    mockReducedMotion(true);
    getSettings.mockResolvedValue({ diceAnimation: true });
    const { result } = renderHook(() => useDiceAnimationSetting());
    await waitFor(() => expect(result.current[0]).toBe(true));
  });

  it('reports not loaded until the saved choice arrives', async () => {
    let resolve;
    getSettings.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useDiceAnimationSetting());
    expect(result.current[2]).toBe(false);
    await act(async () => resolve({ diceAnimation: false }));
    expect(result.current).toEqual([false, expect.any(Function), true]);
  });

  it('counts as loaded even when the request fails', async () => {
    getSettings.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useDiceAnimationSetting());
    await waitFor(() => expect(result.current[2]).toBe(true));
  });

  it('saves a change and applies it at once', async () => {
    getSettings.mockResolvedValue({});
    const { result } = renderHook(() => useDiceAnimationSetting());
    await waitFor(() => expect(result.current[2]).toBe(true));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith({ diceAnimation: false });
  });
});
