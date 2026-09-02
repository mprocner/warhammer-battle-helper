import { renderHook, act } from '@testing-library/react';
import { useFogGmOpacity } from './useFogGmOpacity';
import { getSettings, updateSettings } from '../api/settings';

// Factory mock: the real module pulls in axios (ESM), which CRA's jest transform rejects.
jest.mock('../api/settings', () => ({
  getSettings: jest.fn().mockResolvedValue({}),
  updateSettings: jest.fn().mockResolvedValue({}),
}));

describe('useFogGmOpacity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // react-scripts' jest config sets resetMocks: true, which wipes the mockResolvedValue
    // implementations set at module-factory eval time before every test — restore it here
    // so updateSettings(...).catch(...) in the hook has a promise to call .catch on.
    getSettings.mockClear().mockResolvedValue({});
    updateSettings.mockClear().mockResolvedValue({});
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('sends a single request with the last value after a burst of slider changes', () => {
    const { result } = renderHook(() => useFogGmOpacity());
    const [, setOpacity] = result.current;

    act(() => {
      for (let i = 1; i <= 19; i++) {
        setOpacity(0.1 + i * 0.05);
      }
    });

    expect(updateSettings).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({ fogGmOpacity: 0.1 + 19 * 0.05 });
  });

  it('updates the local value immediately, without waiting for the debounce timer', () => {
    const { result } = renderHook(() => useFogGmOpacity());

    act(() => {
      result.current[1](0.73);
    });

    expect(result.current[0]).toBe(0.73);
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
