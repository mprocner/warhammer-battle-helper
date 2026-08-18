import { renderHook, act } from '@testing-library/react';
import { useGameMusic } from './useGameMusic';
import { setVolume } from '../api/music';
import { WS_EVENTS } from '../websocket/events';

// jsdom doesn't implement HTMLMediaElement playback methods, so a real `new Audio()`
// (created by the hook on every render) logs "Not implemented" console.error noise on
// pause()/load(). Stub it out — nothing here asserts on real audio playback.
class FakeAudio {
  constructor() {
    this.src = '';
    this.currentTime = 0;
    this.volume = 1;
    this.paused = true;
  }
  play() { return Promise.resolve(); }
  pause() {}
  load() {}
  addEventListener() {}
  removeEventListener() {}
}
global.Audio = FakeAudio;

jest.mock('../api/axios', () => ({ getApiUrl: () => 'http://api.test' }));

// Factory mock: the real module pulls in axios (ESM), which CRA's jest transform rejects.
jest.mock('../api/music', () => ({
  getMusic: jest.fn().mockResolvedValue({ musicFiles: [], playlists: [] }),
  playTrack: jest.fn().mockResolvedValue({}),
  nextTrack: jest.fn().mockResolvedValue({}),
  setVolume: jest.fn().mockResolvedValue({}),
}));

describe('useGameMusic — GM volume', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // react-scripts' jest config sets resetMocks: true, which wipes the mockResolvedValue
    // implementations set at module-factory eval time before every test — restore it here
    // so setVolume(...).catch(...) in the hook has a promise to call .catch on.
    setVolume.mockClear().mockResolvedValue({});
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('sends a single request with the last value after a burst of changes', () => {
    const { result } = renderHook(() => useGameMusic('game-1'));

    act(() => {
      for (let i = 1; i <= 10; i++) {
        result.current.onGmVolumeChange(i / 100);
      }
    });

    expect(setVolume).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(setVolume).toHaveBeenCalledTimes(1);
    expect(setVolume).toHaveBeenCalledWith('game-1', 0.1);
  });

  it('updates gmVolume immediately, before the request goes out', () => {
    const { result } = renderHook(() => useGameMusic('game-1'));

    act(() => {
      result.current.onGmVolumeChange(0.73);
    });

    expect(result.current.musicState.gmVolume).toBe(0.73);
    expect(setVolume).not.toHaveBeenCalled();
  });

  it('does not re-commit when the WS echo arrives after the commit already fired', () => {
    const { result } = renderHook(() => useGameMusic('game-1'));

    act(() => {
      result.current.onGmVolumeChange(0.73);
      jest.advanceTimersByTime(300);
    });

    expect(setVolume).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleMusicMessage({
        type: WS_EVENTS.MUSIC_VOLUME,
        payload: { volume: 0.73 },
      });
    });

    // The echo must not re-enter the commit path — still exactly one POST.
    expect(setVolume).toHaveBeenCalledTimes(1);
    expect(result.current.musicState.gmVolume).toBe(0.73);
  });

  it('lets the pending local value win over a mid-flight echo carrying a stale value', () => {
    const { result } = renderHook(() => useGameMusic('game-1'));

    act(() => {
      result.current.onGmVolumeChange(0.73);
    });

    // An echo for an earlier change lands while the GM's own commit is still pending.
    act(() => {
      result.current.handleMusicMessage({
        type: WS_EVENTS.MUSIC_VOLUME,
        payload: { volume: 0.4 },
      });
    });

    // The knob must not jump to the echo's stale value while a newer commit is pending.
    expect(result.current.musicState.gmVolume).toBe(0.73);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // The pending value from the last knob movement is what reaches the server,
    // regardless of the mid-flight echo carrying a now-stale value.
    expect(setVolume).toHaveBeenCalledTimes(1);
    expect(setVolume).toHaveBeenCalledWith('game-1', 0.73);
    // The echo must not yank the knob back either — same guard as syncFromGame.
    expect(result.current.musicState.gmVolume).toBe(0.73);
  });

  it('flushes a pending change when the hook unmounts', () => {
    const { result, unmount } = renderHook(() => useGameMusic('game-1'));

    act(() => {
      result.current.onGmVolumeChange(0.42);
    });

    unmount();

    expect(setVolume).toHaveBeenCalledTimes(1);
    expect(setVolume).toHaveBeenCalledWith('game-1', 0.42);
  });
});
