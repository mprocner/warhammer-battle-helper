import { renderHook, render } from '@testing-library/react';
import usePageTitle, { BRAND, formatPageTitle } from './usePageTitle';

beforeEach(() => {
  document.title = 'stale';
});

describe('formatPageTitle', () => {
  it('appends the brand to the page name', () => {
    expect(formatPageTitle('Login')).toBe('Login · PlayRPG');
  });

  it('falls back to the bare brand without a page name', () => {
    expect(formatPageTitle('')).toBe(BRAND);
    expect(formatPageTitle(null)).toBe(BRAND);
    expect(formatPageTitle(undefined)).toBe(BRAND);
  });
});

describe('usePageTitle', () => {
  it('sets the document title on mount', () => {
    renderHook(() => usePageTitle('Help'));
    expect(document.title).toBe('Help · PlayRPG');
  });

  it('follows a changed value (language switch, game name arriving after fetch)', () => {
    const { rerender } = renderHook(({ page }) => usePageTitle(page), { initialProps: { page: 'Games' } });
    rerender({ page: 'Night in Altdorf' });
    expect(document.title).toBe('Night in Altdorf · PlayRPG');
  });

  it('resets to the brand on unmount', () => {
    const { unmount } = renderHook(() => usePageTitle('Settings'));
    unmount();
    expect(document.title).toBe(BRAND);
  });

  it('lets the next page win when one page replaces another in the same commit', () => {
    const Page = ({ title }) => {
      usePageTitle(title);
      return null;
    };
    const { rerender } = render(<Page key="a" title="Lobby" />);
    rerender(<Page key="b" title="Session" />);
    expect(document.title).toBe('Session · PlayRPG');
  });
});
