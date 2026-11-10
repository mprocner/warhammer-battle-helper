import { renderHook } from '@testing-library/react';
import { useApplyTheme } from './useApplyTheme';

const attr = () => document.documentElement.getAttribute('data-theme');

describe('useApplyTheme', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('puts a non-default theme on <html>, where portals inherit it', () => {
    renderHook(() => useApplyTheme('scifi'));
    expect(attr()).toBe('scifi');
  });

  it('leaves <html> bare for the default theme', () => {
    renderHook(() => useApplyTheme('default'));
    expect(attr()).toBeNull();
  });

  it('follows a theme change', () => {
    const { rerender } = renderHook(({ id }) => useApplyTheme(id), { initialProps: { id: 'scifi' } });
    rerender({ id: 'twenties' });
    expect(attr()).toBe('twenties');
    rerender({ id: 'default' });
    expect(attr()).toBeNull();
  });

  it('clears the theme when the game view unmounts (back to the lobby)', () => {
    const { unmount } = renderHook(() => useApplyTheme('twenties'));
    unmount();
    expect(attr()).toBeNull();
  });
});
