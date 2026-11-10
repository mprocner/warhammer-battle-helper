import { renderHook, act, waitFor } from '@testing-library/react';
import { useAccountBooleanSetting } from './useAccountBooleanSetting';
import { getSettings, updateSettings } from '../api/settings';

// Factory mock: the real module pulls in axios (ESM), which CRA's jest transform rejects.
jest.mock('../api/settings', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
}));

describe('useAccountBooleanSetting', () => {
  beforeEach(() => {
    updateSettings.mockResolvedValue({});
  });

  it('is undefined (never chosen) when nothing is saved', async () => {
    getSettings.mockResolvedValue({});
    const { result } = renderHook(() => useAccountBooleanSetting('ignoreGameTheme'));
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toBeUndefined();
  });

  it('reads the saved value of its own key only', async () => {
    getSettings.mockResolvedValue({ ignoreGameTheme: true, diceAnimation: false });
    const { result } = renderHook(() => useAccountBooleanSetting('ignoreGameTheme'));
    await waitFor(() => expect(result.current[0]).toBe(true));
  });

  it('saves only its own key, optimistically', async () => {
    getSettings.mockResolvedValue({});
    const { result } = renderHook(() => useAccountBooleanSetting('ignoreGameTheme'));
    await waitFor(() => expect(result.current[2]).toBe(true));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(updateSettings).toHaveBeenCalledWith({ ignoreGameTheme: true });
  });

  it('counts as loaded even when the request fails', async () => {
    getSettings.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAccountBooleanSetting('ignoreGameTheme'));
    await waitFor(() => expect(result.current[2]).toBe(true));
  });
});
