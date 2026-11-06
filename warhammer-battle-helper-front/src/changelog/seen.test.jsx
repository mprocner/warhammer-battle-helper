import React from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { LATEST_VERSION } from './releases';
import { markLatestSeen, useChangelogUnseen } from './seen';
import ChangelogDot from './ChangelogDot';

const KEY = 'changelog.lastSeenVersion';

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('useChangelogUnseen', () => {
  it('is unseen when nothing was stored', () => {
    const { result } = renderHook(() => useChangelogUnseen());
    expect(result.current).toBe(true);
  });

  it('is unseen when an older version was stored', () => {
    localStorage.setItem(KEY, '0.0.1');
    const { result } = renderHook(() => useChangelogUnseen());
    expect(result.current).toBe(true);
  });

  it('is seen when the latest version was stored', () => {
    localStorage.setItem(KEY, LATEST_VERSION);
    const { result } = renderHook(() => useChangelogUnseen());
    expect(result.current).toBe(false);
  });

  it('flips to seen in mounted components when marked', () => {
    const { result } = renderHook(() => useChangelogUnseen());
    act(() => markLatestSeen());
    expect(result.current).toBe(false);
    expect(localStorage.getItem(KEY)).toBe(LATEST_VERSION);
  });

  it('treats blocked storage as unseen without throwing', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useChangelogUnseen());
    expect(result.current).toBe(true);
    expect(() => act(() => markLatestSeen())).not.toThrow();
    expect(result.current).toBe(true);
  });
});

describe('ChangelogDot', () => {
  it('shows until the latest version is seen', () => {
    const { container } = render(<ChangelogDot inline />);
    expect(container.querySelector('.changelog-dot.changelog-dot--inline')).toBeInTheDocument();
    act(() => markLatestSeen());
    expect(container.querySelector('.changelog-dot')).not.toBeInTheDocument();
  });
});
